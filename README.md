# Talk to a Folder

A production-quality RAG web app that lets you connect a Google Drive folder and have a grounded, cited conversation with its contents.

---

## FOR AI AGENTS: PICK-UP GUIDE

**If you are an AI agent continuing work on this project, start here.**

### Current state

The app is fully runnable end-to-end. Every layer — UI, hooks, stores, lib, file parsers, services, API routes — is implemented. There is no scaffolding or placeholder code. The app handles real Google Drive folders with real OpenAI calls and streams answers via SSE.

Run it with:
```bash
npm install && npx prisma db push && npm run dev
```

Or in demo mode (no credentials): `NEXT_PUBLIC_MOCK_MODE=true npm run dev`

---

### Implemented since initial build

These were gaps that have since been closed — do not re-implement:

- **Rate limiting** — `POST /api/chat` has an in-memory rate limiter (20 req/user/60s) at the top of [src/app/api/chat/route.ts](src/app/api/chat/route.ts). Returns HTTP 429 with a human-readable retry message.
- **Error toasts** — `sonner` is installed. `<Toaster />` is in [src/app/layout.tsx](src/app/layout.tsx). [src/hooks/useChat.ts](src/hooks/useChat.ts) calls `toast.error()` on non-2xx responses, SSE `error` chunks, and network failures.
- **Folder switch clears session** — [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx) calls `clearMessages()` (which resets both `messages` and `sessionId`) on every folder select. `clearMessages` is defined in [src/store/chat-store.ts:45](src/store/chat-store.ts#L45).
- **TiltCard hooks fix** — `useTransform` calls were incorrectly placed inside JSX `style` props in [src/components/ui/TiltCard.tsx](src/components/ui/TiltCard.tsx). Moved to component top level as `innerX`/`innerY`.

---

### Known gaps — what to build next

These are the remaining meaningful things left. Each has implementation notes.

#### 1. File size guard in the API before fetching

**Problem**: `MAX_FILE_SIZE_BYTES = 20MB` is defined in constants but never checked before downloading a file from Drive. Large files will silently consume memory.

**Where to add**: [src/lib/file-parsers/index.ts](src/lib/file-parsers/index.ts) or [src/services/ingestion-service.ts](src/services/ingestion-service.ts). Each `DriveFile` has a `size` field — check it before calling `parseFile()` and mark oversized files as `'skipped'` with an `errorMessage`.

---

#### 5. Cross-folder comparison / multi-folder chat

**Current limitation**: Retrieval is scoped to one folder — `WHERE folderId = activeFolder`. Even if conversation history mentions content from another folder, GPT-4o can't re-retrieve from it. Switching folders starts a new retrieval scope.

**What this means for users**: You can't ask "Folder A says X — does Folder B agree?" and get a grounded answer from both. GPT-4o can only compare what's in the current folder's retrieved chunks against whatever is in the conversation history as plain text.

**What full cross-folder support would require**:

1. **Retrieval** — change `retrieve(query, folderId)` to `retrieve(query, folderIds: string[])` in [src/lib/retrieval.ts](src/lib/retrieval.ts). The vector store query already supports arbitrary filters — just remove the single-folder constraint.

2. **Citations** — add `folderName` to the `Citation` type so the UI can show which folder each chunk came from.

3. **UI** — a way to select which folders are in scope. Simplest: checkboxes next to each folder in the sidebar. Or a "search all folders" toggle.

4. **Prompt** — tell GPT-4o it's working across multiple folders so it attributes answers correctly: "According to [Folder A]... whereas [Folder B] says..."

5. **Session model** — per-folder sessions (see note below on session design) would need to be extended to support multi-folder sessions.

**Effort**: Medium. Retrieval and prompt changes are small. The UI selection pattern is the most design work.

---

#### 6. Per-folder chat sessions (better than global clear)

**Current behavior**: Switching folders clears messages and `sessionId`. Simple but lossy — if you switch back to folder A, the conversation is gone.

**Better model**: Store a separate `{ sessionId, messages }` per folder in the chat store:

```typescript
// chat-store.ts
sessions: Record<string, { sessionId: string | null; messages: ChatMessage[] }>
```

Switching folders would just change which slot is active — each folder's conversation is preserved independently. Switching back to folder A picks up exactly where you left off.

**Where to change**: [src/store/chat-store.ts](src/store/chat-store.ts) (restructure state), [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx) (remove `clearMessages()` on select), [src/hooks/useChat.ts](src/hooks/useChat.ts) (read/write into `sessions[activeFolderId]`).

---

#### 7. Production vector store swap

**Not urgent — but the path is already paved.** The `VectorStore` interface in [src/lib/vector-store.ts](src/lib/vector-store.ts) abstracts the backend. Current impl is `PrismaVectorStore` (SQLite + in-memory cosine). For production scale:

- Implement `PineconeVectorStore` or a `pgvector`-backed store in a new file
- Export it from `vector-store.ts` alongside the existing one
- Swap the export: `export const vectorStore = new PineconeVectorStore()`
- No other file needs to change

---

### Patterns — follow these exactly

**Imports**: Always `@/` alias. Never relative `../../`.

**Mock mode**: Every hook and API route checks `const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'` and returns mock data from [src/lib/mock-data.ts](src/lib/mock-data.ts) in mock mode.

**API response shape**: `{ data: ... }` on success, `{ error: 'message' }` on failure. No naked objects.

**Styling**: `zinc-*` for neutrals, `indigo-*` for accent. Never `gray-*`. Active/selected states use `indigo-500/10` bg + `indigo-500/20` border.

**Types**: Import from `@/types` (barrel export). Never from individual type files inside components.

**Components**: All `'use client'`. Server-only code lives in `lib/`, `services/`, `app/api/`.

---

### What NOT to change

These are stable and well-tested — don't touch them unless fixing a specific bug:

- All files in `src/components/` (UI is complete)
- All files in `src/types/` (types are finalized)
- All files in `src/store/` (stores are finalized)
- All files in `src/constants/animations.ts` (Framer Motion variants)
- `src/lib/chunker.ts`, `src/lib/embeddings.ts`, `src/lib/vector-store.ts`
- `prisma/schema.prisma`
- `tailwind.config.ts`, `next.config.mjs`

---

### Key file map

| File | What it does |
|------|-------------|
| [src/components/layout/AppShell.tsx](src/components/layout/AppShell.tsx) | Root client component — folder selection, session, intro animation |
| [src/store/chat-store.ts](src/store/chat-store.ts) | `messages`, `sessionId`, `activeFolderId`, `clearMessages()` |
| [src/store/ui-store.ts](src/store/ui-store.ts) | `highlightedCitationId`, panel state, sidebar state |
| [src/hooks/useChat.ts](src/hooks/useChat.ts) | SSE stream reader, sends `sessionId` on every request |
| [src/lib/retrieval.ts](src/lib/retrieval.ts) | Cosine search + spread strategy for broad questions |
| [src/lib/answer-generator.ts](src/lib/answer-generator.ts) | GPT-4o call, conversation history injection, confidence scoring |
| [src/services/ingestion-service.ts](src/services/ingestion-service.ts) | Full parse→chunk→embed→index pipeline, in-memory progress map |
| [src/services/chat-service.ts](src/services/chat-service.ts) | Retrieval + generation orchestration, DB persistence |
| [src/app/api/chat/route.ts](src/app/api/chat/route.ts) | SSE streaming endpoint |
| [src/lib/google-auth.ts](src/lib/google-auth.ts) | Auto token refresh using stored `refresh_token` |
| [src/constants/index.ts](src/constants/index.ts) | All tunable constants: chunk size, score thresholds, model names |

---

## What it does

1. **Authenticate** with Google OAuth
2. **Paste a Google Drive folder link** — the app extracts the folder ID and lists all supported files, including files inside subfolders (up to 5 levels deep)
3. **Index** — files are parsed, chunked, embedded with `text-embedding-3-small`, and stored in SQLite
4. **Chat** — ask questions; the app retrieves the most relevant chunks, generates an answer with GPT-4o via SSE streaming, and returns inline citation markers `[1][2][3]`
5. **Inspect** — hover a citation to highlight the matching source card; click to expand the exact chunk; open the Debug tab to see cosine scores for every retrieved chunk

---

## Current status — fully runnable

All layers are implemented and the app runs end-to-end with real Google credentials and OpenAI keys.

### What's implemented

**Auth & Google integration**
- NextAuth v4 with Google OAuth (`drive.readonly` scope)
- Automatic access token refresh using stored `refresh_token` — no re-login required when tokens expire
- Recursive Google Drive folder traversal (subfolders up to depth 5, up to 200 files total)
- File names preserve relative path: `subfolder/document.docx`

**File parsing**
| Format | Parser |
|--------|--------|
| Google Docs | Drive API export → plain text |
| Google Sheets | Drive API export → CSV → `Header: value` rows |
| PDF | `pdf-parse` |
| Plain text / Markdown / CSV | passthrough |
| Word (.docx / .doc) | `mammoth` |
| Excel (.xlsx / .xls) | `SheetJS` |
| PowerPoint (.pptx / .ppt) | `officeparser` |

**RAG pipeline**
- Text chunker: 1800 chars / 200 char overlap
- Embeddings: `text-embedding-3-small` (1536d), in-memory cosine similarity over SQLite
- Retrieval: top-8 chunks retrieved, top-5 passed to LLM
- **Spread strategy** for broad/overview questions: when top score < 0.40, picks the best chunk from each unique file so every file gets representation
- Conversation memory: last 6 messages are injected as history on follow-up turns
- Confidence scoring: high ≥ 0.60, medium ≥ 0.45, low below that

**API routes**
- `POST /api/folders` — create folder, fire-and-forget ingestion
- `GET /api/folders` — list user's folders
- `GET/DELETE /api/folders/[id]` — get or delete a folder
- `POST /api/folders/[id]/ingest` — trigger re-index
- `GET /api/folders/[id]/status` — ingestion progress (polled by UI)
- `GET /api/folders/[id]/files` — list indexed files
- `POST /api/chat` — SSE streaming: `token` → `citations` → `metadata` → `debug` → `[DONE]`; rate limited to 20 req/user/60s, returns 429 with retry time on breach

**Error handling**
- `sonner` toasts on all API failures — rate limit, token expiry, OpenAI errors, network failures
- SSE `error` chunks (server-side failures mid-stream) surface as toasts, not silent drops
- Folder switch calls `clearMessages()` — resets `messages` and `sessionId` so history doesn't bleed across folders

**UI**
- Curtain-lift intro animation on first load (Framer Motion)
- 3D tilt/parallax hover effect on folder cards and suggested question cards (`TiltCard` component)
- Floating chat composer with `backdrop-blur` and deep shadow
- Gradient fade above composer so messages scroll cleanly behind it
- Dot grid background on message area
- Two-step inline delete confirmation on folder cards
- Real-time re-index: button polls `/status` until `indexed`/`error`, then refreshes files panel
- Right panel: Sources tab (citation cards), Files tab (folder tree), Debug tab (chunk scores)

**Mock mode**
- Set `NEXT_PUBLIC_MOCK_MODE=true` to run the full UI with no credentials
- Includes a mock "Q4 2024 Product Strategy" folder with 5 files, 4 suggested questions, 3 detailed Q&A pairs, and simulated word-by-word streaming

---

## What's not done yet

| Gap | Notes |
|-----|-------|
| File size guard | 20 MB cap in constants but never checked before fetching — oversized files consume memory silently |
| Per-folder chat sessions | Switching folders clears history. Better: keep a session per folder so switching back restores the conversation |
| Cross-folder comparison | Retrieval is scoped to one folder. True multi-folder Q&A requires retrieval across multiple vector sets |
| Production vector store | SQLite + in-memory cosine is fine for hundreds of chunks. For scale: swap `PrismaVectorStore` for Pinecone or `pgvector` — one-file change |
| Test suite | No unit or integration tests |
| Deployment config | No `vercel.json` or Dockerfile |

---

## Architecture

```
User pastes Drive URL
  → Extract folder ID (lib/utils.ts)
  → Recursive file list via Drive API (lib/google-drive.ts)
  → Parse each file (lib/file-parsers/)
  → Chunk text (lib/chunker.ts)
  → Embed with text-embedding-3-small (lib/embeddings.ts)
  → Store in SQLite via Prisma (lib/vector-store.ts)

On query:
  → Embed question
  → Cosine similarity search → top-K chunks
  → Spread strategy if broad question
  → Inject last 6 messages as history
  → Generate answer via GPT-4o (lib/answer-generator.ts)
  → SSE stream tokens → citations → metadata → debug
  → Frontend renders inline CitationBadge components
  → Citation hover → Zustand atom → SourceCard highlight
```

### State

- **`ui-store`** (Zustand): `highlightedCitationId`, `expandedSourceId`, `rightPanelTab`, `rightPanelOpen`, `sidebarCollapsed`, `addFolderModalOpen`
- **`chat-store`** (Zustand): `messages[]`, `activeFolderId`, `sessionId`, `isStreaming`, `currentCitations`

Citation ↔ source sync is zero-overhead: `CitationBadge` writes `highlightedCitationId`, `SourceCard` reads it — no prop drilling, no Context re-renders.

---

## File tree

```
src/
├── app/
│   ├── globals.css              dot grid, gradient text utilities
│   ├── layout.tsx
│   ├── page.tsx
│   ├── providers.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── folders/
│       │   ├── route.ts                 GET list, POST create
│       │   └── [folderId]/
│       │       ├── route.ts             GET, DELETE
│       │       ├── ingest/route.ts      POST trigger
│       │       ├── status/route.ts      GET progress
│       │       └── files/route.ts       GET file list
│       └── chat/route.ts                POST SSE stream
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── MainWorkspace.tsx
│   │   └── IntroAnimation.tsx           curtain-lift on first load
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatComposer.tsx             floating, backdrop-blur
│   │   ├── MessageList.tsx
│   │   ├── UserMessage.tsx
│   │   ├── AssistantAnswer.tsx
│   │   ├── CitationBadge.tsx
│   │   ├── EmptyChat.tsx                suggested questions with TiltCard
│   │   └── AnswerMetadata.tsx
│   ├── folders/
│   │   ├── AddFolderModal.tsx
│   │   ├── FolderCard.tsx               TiltCard 3D hover, inline delete confirm
│   │   ├── FolderList.tsx
│   │   ├── FolderStatusPill.tsx
│   │   └── IngestionProgress.tsx
│   ├── sources/
│   │   ├── SourcesPanel.tsx
│   │   ├── SourceTabs.tsx
│   │   ├── SourceCard.tsx
│   │   ├── FolderTree.tsx
│   │   ├── DebugPanel.tsx
│   │   └── ChunkCard.tsx
│   └── ui/
│       ├── TiltCard.tsx                 3D tilt + parallax (Framer Motion)
│       ├── AnimatedBorder.tsx
│       ├── LoadingDots.tsx
│       └── [shadcn components]
│
├── hooks/
│   ├── useChat.ts                       SSE stream reader, sessionId persistence
│   ├── useFolders.ts
│   ├── useFolder.ts                     exposes refetch()
│   ├── useIngestion.ts
│   └── useSourceHighlight.ts
│
├── lib/
│   ├── answer-generator.ts              GPT-4o, conversation history, confidence scoring
│   ├── chunker.ts
│   ├── embeddings.ts                    text-embedding-3-small
│   ├── retrieval.ts                     cosine search + spread strategy
│   ├── vector-store.ts                  Prisma SQLite backend
│   ├── google-drive.ts                  recursive walk, subfolder support
│   ├── google-auth.ts                   auto token refresh
│   ├── auth.ts
│   ├── prisma.ts
│   ├── mock-data.ts
│   └── file-parsers/
│       ├── index.ts                     registry pattern
│       ├── google-doc.ts
│       ├── google-sheet.ts
│       ├── pdf.ts
│       ├── plain-text.ts
│       ├── word.ts                      mammoth
│       ├── excel.ts                     SheetJS
│       └── powerpoint.ts               officeparser
│
├── services/
│   ├── folder-service.ts               CRUD, DB writes
│   ├── ingestion-service.ts            parse → chunk → embed → index pipeline
│   └── chat-service.ts                 retrieval + generation, history injection
│
├── store/
│   ├── ui-store.ts
│   └── chat-store.ts
│
├── types/
│   ├── index.ts
│   ├── folder.ts
│   ├── chat.ts
│   ├── retrieval.ts
│   └── api.ts
│
└── constants/
    ├── index.ts                         limits, thresholds, model names
    └── animations.ts                    shared Framer Motion variants
```

---

## Setup

### Prerequisites
- Node.js 18+
- Google Cloud project with Drive API enabled and OAuth 2.0 credentials (`drive.readonly` scope)
- OpenAI API key

### Install & run

```bash
npm install
cp .env.local.example .env.local
# fill in your credentials
npx prisma db push
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
DATABASE_URL=file:./dev.db
NEXT_PUBLIC_MOCK_MODE=false
```

### Demo mode (no credentials needed)

```bash
NEXT_PUBLIC_MOCK_MODE=true
```

Full UI flow runs without any API keys: simulated ingestion, word-by-word streaming, citation highlighting, debug panel.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 App Router |
| Auth | NextAuth v4 + Google OAuth |
| Database | Prisma + SQLite (dev) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o` |
| UI | Tailwind CSS + shadcn/ui + Framer Motion |
| State | Zustand |
| Icons | Lucide |
