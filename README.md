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
- **TiltCard hooks fix** — `useTransform` calls were incorrectly placed inside JSX `style` props in [src/components/ui/TiltCard.tsx](src/components/ui/TiltCard.tsx). Moved to component top level as `innerX`/`innerY`.
- **Multi-tab / per-folder sessions** — chat store replaced the flat `{ messages, sessionId, activeFolderId }` shape with `tabs: ChatTab[]` + `activeTabId`. Each tab holds its own `folderIds`, `sessionId`, `messages`, and `currentCitations`. Switching folders opens a new tab; switching back restores its conversation. Implemented in [src/store/chat-store.ts](src/store/chat-store.ts).
- **Chat history persistence** — on authenticated load, `AppShell` fetches `GET /api/sessions` (20 most-recent sessions) and calls `loadFromHistory()`, reconstructing tabs from DB without overwriting any already-open tabs.
- **Cross-folder comparison (#7)** — [src/lib/retrieval.ts](src/lib/retrieval.ts) accepts `folderIds: string[]` (plural). For multi-folder queries, retrieval uses two-pass balanced selection (floor(TOP_K/N) minimum per folder, then global fill). [src/lib/answer-generator.ts](src/lib/answer-generator.ts) labels each chunk with `[Folder: Name]` and selects `CROSS_FOLDER_SYSTEM_PROMPT` for comparison queries.
- **Summarization fix** — "summarize" queries bypass cosine similarity entirely. [src/lib/vector-store.ts](src/lib/vector-store.ts) `getFirstChunksPerFile()` returns `chunkIndex=0` for every file, guaranteeing all files are represented regardless of how their content embeds. The system prompt also mandates every file be mentioned.
- **Query rewriting** — [src/services/chat-service.ts](src/services/chat-service.ts) calls `rewriteQueryIfNeeded()` before retrieval. A `gpt-4o-mini` call resolves contextual pronouns ("that file", "tell me more") into self-contained questions using recent history. Gated by a `CONTEXTUAL_RE` regex to avoid unnecessary API calls; falls back silently on error.
- **Re-index staleness detection** — [src/components/folders/FolderCard.tsx](src/components/folders/FolderCard.tsx) shows an amber timestamp + warning icon with tooltip when `lastIndexed` is more than 24 hours ago.
- **File error/skip reasons** — [src/components/sources/FolderTree.tsx](src/components/sources/FolderTree.tsx) wraps skipped/error status dots in a `Tooltip` showing `file.errorMessage`. Ingestion service sets `errorMessage` on skipped (empty/image-only) files.
- **Drag-to-resize panel divider** — [src/components/layout/MainWorkspace.tsx](src/components/layout/MainWorkspace.tsx) replaced the static `Separator` with a 5px drag handle. `mousedown` / `mousemove` / `mouseup` on `window` track delta from drag start; panel width clamped to 240–640px.
- **Legacy format error messages** — `.doc` and `.ppt` files (OLE2 binary, not supported by any parser) now throw clear user-facing errors with instructions to convert to `.docx` / `.pptx`. [src/lib/file-parsers/index.ts](src/lib/file-parsers/index.ts).
- **Google Drive 500 retry** — [src/lib/google-drive.ts](src/lib/google-drive.ts) `exportGoogleFile()` retries once after 2s on HTTP 500/503 from Google's export API, with a cleaned error message on second failure.

### Codex: implemented during testing pass

These changes were added by Codex after the app was already functionally complete. They are meant to help the next coding agent understand the current test coverage and avoid redoing the same harness work.

- **Codex: Node test harness** — added [tests/register.cjs](tests/register.cjs) and [tests/run.cjs](tests/run.cjs). The harness runs TypeScript tests with Node's built-in test runner, transpiles `.ts` files through `typescript.transpileModule`, and resolves the `@/` alias to `src/`.
- **Codex: test scripts** — added category scripts to [package.json](package.json):
  - `npm test`
  - `npm run test:unit`
  - `npm run test:functional`
  - `npm run test:smoke`
  - `npm run test:blackbox`
- **Codex: unit tests** — added tests for utility helpers, chunking behavior, and lightweight parser cleanup:
  - [tests/utils.unit.test.ts](tests/utils.unit.test.ts)
  - [tests/chunker.unit.test.ts](tests/chunker.unit.test.ts)
  - [tests/file-parsers.unit.test.ts](tests/file-parsers.unit.test.ts)
- **Codex: functional tests** — added mocked functional tests for the highest-risk backend flows:
  - [tests/chat-route.functional.test.ts](tests/chat-route.functional.test.ts) — `POST /api/chat` auth errors, validation, folder ownership, indexed-state validation, SSE payload shape, message trimming, session reuse, and rate limiting.
  - [tests/folder-routes.functional.test.ts](tests/folder-routes.functional.test.ts) — folder list/create/get/delete/status/files/ingest route behavior with mocked auth/services/token lookup.
  - [tests/ingestion-service.functional.test.ts](tests/ingestion-service.functional.test.ts) — parse → chunk → embed → index pipeline, skipped empty files, parser failures, final folder status, progress tracking, and Drive discovery failure handling.
  - [tests/retrieval.functional.test.ts](tests/retrieval.functional.test.ts) — query embedding, folder-scoped vector search, selected chunks/debug metadata, and broad-query spread strategy.
  - [tests/answer-generator.functional.test.ts](tests/answer-generator.functional.test.ts) — unsupported fallback, citation parsing, invalid citation marker handling, confidence scoring, history injection, debug latency updates, and streaming callback behavior.
  - [tests/chat-service.functional.test.ts](tests/chat-service.functional.test.ts) — session reuse/creation, user/assistant message persistence, history shaping, retrieval call, answer generation call, streaming callback, and response assembly.
  - [tests/file-parser-dispatcher.functional.test.ts](tests/file-parser-dispatcher.functional.test.ts) — MIME-type dispatch for Google Docs/Sheets, PDF, plain text, Markdown, CSV, Word, Excel, PowerPoint, and unsupported MIME errors.
- **Codex: smoke tests** — added [tests/app.smoke.test.ts](tests/app.smoke.test.ts), which checks that the main app entry points, API routes, services, parser files, and test scripts exist.
- **Codex: black-box tests** — added public-contract tests:
  - [tests/chat-store.blackbox.test.ts](tests/chat-store.blackbox.test.ts) — chat store message/session behavior through public actions.
  - [tests/file-parsers.blackbox.test.ts](tests/file-parsers.blackbox.test.ts) — common `ParsedFile` return shape for text-like parsers.
- **Codex: current test status** — as of this update, `npm test` passes with **49 tests / 13 suites / 0 failures**. `npm run test:functional` passes with **33 tests / 7 suites / 0 failures**.

### Integration tests (real SQLite DB)

Added after Codex's functional pass. These use a real SQLite test DB (`prisma/test.db`) and real Prisma queries. Only OpenAI and Google Drive are mocked. Run with `npm run test:integration` (pushes schema to test DB first via `prisma db push --force-reset`).

- **[tests/integration/setup.ts](tests/integration/setup.ts)** — shared `testPrisma` client, `injectTestPrisma()` cache patcher, `clearDatabase()`, and seed helpers (`seedUser`, `seedFolder`, `seedFile`).
- **[tests/integration/folder-service.integration.test.ts](tests/integration/folder-service.integration.test.ts)** — `getFoldersForUser` ownership isolation, `getFolderById` cross-user denial, `updateFolderStatus` partial field merge, `deleteFolder` CASCADE to child files, `upsertFiles` update-not-insert behavior, `discoverAndSaveFiles` re-index duplicate prevention.
- **[tests/integration/vector-store.integration.test.ts](tests/integration/vector-store.integration.test.ts)** — `upsert` JSON embedding serialization, cosine similarity ranking, `topK` cap, `folderId` filter isolation, cross-folder queries, `deleteByFolder` cleanup, `fileName` join from `DriveFile`.
- **[tests/integration/chat-persistence.integration.test.ts](tests/integration/chat-persistence.integration.test.ts)** — `getOrCreateSession` create/reuse/phantom-id, `saveUserMessage` role/content, `saveAssistantMessage` JSON round-trip for citations/metadata/debugInfo, `chat()` message persistence, `chat()` history loading order.
- **Current status** — `npm run test:integration` passes with **28 tests / 3 suites / 0 failures**.

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

- All files in `src/constants/animations.ts` (Framer Motion variants)
- `src/lib/chunker.ts`, `src/lib/embeddings.ts`
- `tailwind.config.ts`, `next.config.mjs`

---

### Key file map

| File | What it does |
|------|-------------|
| [src/components/layout/AppShell.tsx](src/components/layout/AppShell.tsx) | Root client component — folder selection, session, intro animation |
| [src/components/layout/AppShell.tsx](src/components/layout/AppShell.tsx) | Root client component — loads history on auth, manages tab/session lifecycle |
| [src/store/chat-store.ts](src/store/chat-store.ts) | `tabs: ChatTab[]`, `activeTabId`, `loadFromHistory()`, `addTab()` |
| [src/store/ui-store.ts](src/store/ui-store.ts) | `highlightedCitationId`, panel state, sidebar state |
| [src/hooks/useChat.ts](src/hooks/useChat.ts) | SSE stream reader, sends `sessionId` on every request |
| [src/lib/retrieval.ts](src/lib/retrieval.ts) | Cosine search, `getFirstChunksPerFile` summarization path, multi-folder balanced retrieval |
| [src/lib/answer-generator.ts](src/lib/answer-generator.ts) | GPT-4o call, folder-labeled context, cross-folder/summarization/citation prompts, confidence scoring |
| [src/services/ingestion-service.ts](src/services/ingestion-service.ts) | Full parse→chunk→embed→index pipeline, in-memory progress map |
| [src/services/chat-service.ts](src/services/chat-service.ts) | Query rewriting, retrieval + generation orchestration, DB persistence |
| [src/app/api/chat/route.ts](src/app/api/chat/route.ts) | SSE streaming endpoint |
| [src/app/api/sessions/route.ts](src/app/api/sessions/route.ts) | `GET /api/sessions` — returns 20 most-recent sessions with messages for history restore |
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
- **Summarization path**: bypasses cosine search entirely — `getFirstChunksPerFile()` fetches `chunkIndex=0` per file, guaranteeing all files appear in context (capped at 12)
- **Query rewriting**: `gpt-4o-mini` resolves follow-up pronouns ("that file", "tell me more") into self-contained questions before retrieval; gated by contextual-reference regex; fails silently
- **Multi-folder retrieval**: two-pass balanced selection — Pass 1 fills minimum slots per folder, Pass 2 fills remaining from global top
- **Folder-labeled context**: each chunk tagged `[Folder: Name] FILE: filename.docx` in multi-folder queries; separate `CROSS_FOLDER_SYSTEM_PROMPT` for comparison queries
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
- `GET /api/sessions` — returns 20 most-recent sessions with messages, used to restore tabs on page reload

**Error handling**
- `sonner` toasts on all API failures — rate limit, token expiry, OpenAI errors, network failures
- SSE `error` chunks (server-side failures mid-stream) surface as toasts, not silent drops
- `.doc` / `.ppt` (legacy OLE2 formats) throw actionable errors with conversion instructions instead of silently failing
- Google Drive export 500/503 errors trigger one automatic retry after 2s; 403 surfaces as "Access denied"

**UI**
- Curtain-lift intro animation on first load (Framer Motion)
- 3D tilt/parallax hover effect on folder cards and suggested question cards (`TiltCard` component)
- Floating chat composer with `backdrop-blur` and deep shadow
- Gradient fade above composer so messages scroll cleanly behind it
- Dot grid background on message area
- Two-step inline delete confirmation on folder cards
- Real-time re-index: button polls `/status` until `indexed`/`error`, then refreshes files panel
- Right panel: Sources tab (citation cards), Files tab (folder tree), Debug tab (chunk scores)
- **Drag-to-resize panel divider**: 5px handle between chat and sources panel, width clamped 240–640px
- **Staleness badge**: amber timestamp + warning icon on folder cards when `lastIndexed` > 24 hours ago
- **File error tooltips**: hovering skipped/error dots in the Files panel shows the reason (e.g. "No text content found — file may be image-only")
- **Multi-tab chat**: each folder combination opens in its own tab; switching back restores the conversation; history loaded from DB on page reload

**Mock mode**
- Set `NEXT_PUBLIC_MOCK_MODE=true` to run the full UI with no credentials
- Includes a mock "Q4 2024 Product Strategy" folder with 5 files, 4 suggested questions, 3 detailed Q&A pairs, and simulated word-by-word streaming

---

## What's not done yet

| Gap | Notes |
|-----|-------|
| File size guard | 20 MB cap in constants but never checked before fetching — oversized files consume memory silently |
| Production vector store | SQLite + in-memory cosine is fine for hundreds of chunks. For scale: swap `PrismaVectorStore` for Pinecone or `pgvector` — one-file change |
| Additional testing | Codex added 49 tests across unit, functional, smoke, and black-box layers. Remaining valuable additions: Playwright mock-mode E2E, real fixture tests for PDF/Word/Excel/PowerPoint parser libraries, Google Drive helper tests with mocked `googleapis`, and vector-store tests against a test DB or deeper Prisma mocks |
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
  → Rewrite query if it has contextual references (gpt-4o-mini)
  → Embed effective query
  → Summarization? → getFirstChunksPerFile (skips cosine search)
  → Otherwise: cosine similarity search → top-K chunks
  → Multi-folder? → balanced two-pass retrieval; label chunks [Folder: Name]
  → Spread strategy if broad question (topScore < 0.40)
  → Select prompt: citation / summarization / cross-folder comparison
  → Inject last 6 messages as history
  → Generate answer via GPT-4o (lib/answer-generator.ts)
  → SSE stream tokens → citations → metadata → debug
  → Frontend renders inline CitationBadge components
  → Citation hover → Zustand atom → SourceCard highlight
```

### State

- **`ui-store`** (Zustand): `highlightedCitationId`, `expandedSourceId`, `rightPanelTab`, `rightPanelOpen`, `sidebarCollapsed`, `addFolderModalOpen`
- **`chat-store`** (Zustand): `tabs: ChatTab[]`, `activeTabId`. Each tab: `{ id, sessionId, folderIds, messages, isStreaming, currentCitations }`. `loadFromHistory()` reconstructs tabs from DB on page load without overwriting open tabs.

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
│       ├── chat/route.ts                POST SSE stream
│       └── sessions/route.ts           GET recent sessions (history restore)
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

### Codex: tests

Codex added a lightweight test suite using Node's built-in test runner. No Jest/Vitest dependency is required.

```bash
npm test
npm run test:unit
npm run test:functional
npm run test:smoke
npm run test:blackbox
```

Current verified status:

```text
npm test
49 tests passed
13 suites passed
0 failed
```

Test categories:

| Command | Coverage |
|---------|----------|
| `npm run test:unit` | Pure helpers, chunking, simple parser cleanup |
| `npm run test:functional` | Chat API, folder API, ingestion service, retrieval, answer generator, chat service, parser dispatcher |
| `npm run test:smoke` | Required file/API/service/parser structure and test scripts |
| `npm run test:blackbox` | Public behavior of chat store and parser contracts |

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
