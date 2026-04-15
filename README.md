# Talk to a Folder

A production-quality AI web app that lets you connect a Google Drive folder and have a grounded, cited conversation with its contents. Built for an AI-forward engineering take-home — engineered like a serious product, not a hackathon demo.

---

## FOR AI AGENTS: PICK-UP GUIDE

**If you are an AI agent continuing this build, start here.** This section tells you everything you need to know to pick up exactly where work stopped.

### Current state (as of last session)

**62 files have been written. The app cannot run yet.** The entire UI layer, all types, all stores, all hooks, all backend lib abstractions, and the mock data engine are complete. What is missing is the thin wiring layer: file parsers, services, and API routes. These are the last 15 files needed to make the app runnable.

### Exactly what to build next

Build these files **in this order** (each depends on the previous):

#### Step 1 — File parsers (`src/lib/file-parsers/`)

Create 5 files. These parse raw Drive content into plain text for chunking.

**`src/lib/file-parsers/index.ts`**
- Export a `FileParser` interface: `{ canParse(mimeType: string): boolean; parse(content: string | Buffer, meta: { fileId, fileName, mimeType }): Promise<ParsedFile> }`
- Export a `parserRegistry: FileParser[]`
- Export a `getParser(mimeType: string): FileParser | null` function that walks the registry
- Import and register: `GoogleDocParser`, `GoogleSheetParser`, `PDFParser`, `PlainTextParser`

**`src/lib/file-parsers/google-doc.ts`**
- Handles mimeType `application/vnd.google-apps.document`
- Input is already plain text (exported from Drive API as `text/plain`)
- Strip extra whitespace, normalize line breaks
- Return `ParsedFile` with the cleaned text

**`src/lib/file-parsers/google-sheet.ts`**
- Handles mimeType `application/vnd.google-apps.spreadsheet`
- Input is CSV (exported from Drive API as `text/csv`)
- Parse CSV rows into a readable text format: `"Column1: value, Column2: value"` per row
- Include sheet name as a header if available

**`src/lib/file-parsers/pdf.ts`**
- Handles mimeType `application/pdf`
- Input is a `Buffer`
- Use the `pdf-parse` npm package: `import pdfParse from 'pdf-parse'`
- Return extracted `.text` from the result

**`src/lib/file-parsers/plain-text.ts`**
- Handles mimeTypes: `text/plain`, `text/markdown`, `text/csv`
- Input is a string
- Minimal cleanup: trim, normalize line endings
- Return as-is

The `ParsedFile` type already exists in `src/types/retrieval.ts`:
```typescript
interface ParsedFile {
  fileId: string
  fileName: string
  mimeType: string
  content: string
  metadata?: Record<string, unknown>
}
```

---

#### Step 2 — Services (`src/services/`)

Create 3 files. These are the orchestration layer — they call lib functions and write to the database.

**`src/services/folder-service.ts`**

Functions to implement:
```typescript
createFolder(userId: string, driveUrl: string, accessToken: string): Promise<IndexedFolder>
// - Extract folder ID from URL using extractFolderIdFromUrl() from lib/utils.ts
// - Call getFolderName() from lib/google-drive.ts to get the name
// - Write to prisma.indexedFolder.create()
// - Return the created folder

getFolder(folderId: string, userId: string): Promise<IndexedFolder | null>
// - prisma.indexedFolder.findFirst({ where: { id: folderId, userId } })

listFolders(userId: string): Promise<IndexedFolder[]>
// - prisma.indexedFolder.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })

deleteFolder(folderId: string, userId: string): Promise<void>
// - prisma.indexedFolder.delete()
// - Also delete vector embeddings: vectorStore.deleteByFolder(folderId)

updateFolderStatus(folderId: string, status: FolderStatus, extra?: Partial<IndexedFolder>): Promise<void>
// - prisma.indexedFolder.update()
```

**`src/services/ingestion-service.ts`**

This is the most important service. It orchestrates the full parse → chunk → embed → index pipeline.

```typescript
startIngestion(folder: IndexedFolder, accessToken: string): Promise<void>
```

Implementation steps inside `startIngestion`:
1. Set folder status to `'ingesting'` via `updateFolderStatus()`
2. Call `listFolderFiles(folder.folderId, accessToken, folder.id)` from `lib/google-drive.ts`
3. Write all `DriveFile` records to `prisma.driveFile.createMany()`
4. Update `folder.fileCount`
5. For each file:
   a. Update file status to `'parsing'`
   b. Get the parser: `getParser(file.mimeType)` — skip if null (set status `'skipped'`)
   c. Fetch content: use `exportGoogleFile()` for Docs/Sheets, `downloadFile()` for PDFs/text
   d. Parse: `parser.parse(content, { fileId: file.id, fileName: file.name, mimeType: file.mimeType })`
   e. Chunk: `chunkText(parsed.content, file.id, folder.id)` from `lib/chunker.ts`
   f. Embed batch: `embeddings.embedBatch(chunks.map(c => c.text))` from `lib/embeddings.ts`
   g. Upsert to vector store: `vectorStore.upsert(records)` — records map chunk + embedding to `VectorRecord`
   h. Update file status to `'indexed'`, set `parsedAt`
6. Update folder status to `'indexed'`, set `lastIndexed`, `chunkCount`
7. On any file error: set file status to `'error'`, store `errorMessage`, continue to next file
8. On total failure: set folder status to `'error'`

```typescript
getIngestionStatus(folderId: string): Promise<IngestionProgress>
// Query folder + files from DB and build an IngestionProgress object
// progress.total = total files
// progress.parsed = files with status 'indexed' | 'error' | 'skipped'
// progress.indexed = files with status 'indexed'
// progress.failed = files with status 'error'
// currentFile = first file with status 'parsing'
```

**`src/services/chat-service.ts`**

```typescript
chat(folderId: string, message: string, sessionId?: string): Promise<{ sessionId: string; response: ChatResponse }>
// 1. Get or create a ChatSession in DB
// 2. Call retrieve(message, folderId) from lib/retrieval.ts
// 3. Call generateAnswer(message, retrieval) from lib/answer-generator.ts
// 4. Persist user message + assistant message to DB (JSON.stringify citations/metadata/debug)
// 5. Return { sessionId, response: { messageId, sessionId, answer, citations, metadata, debug } }

chatStream(folderId: string, message: string, sessionId: string | undefined, onToken: (token: string) => void): Promise<{ sessionId: string; response: ChatResponse }>
// Same as chat() but passes onToken callback to generateAnswer() for streaming
```

---

#### Step 3 — API routes (`src/app/api/`)

Create 7 route files. All routes must:
- Check `getServerSession(authOptions)` and return 401 if no session
- Return `{ data: ... }` on success, `{ error: '...' }` on failure
- Use try/catch and return appropriate HTTP status codes

**`src/app/api/auth/[...nextauth]/route.ts`**
```typescript
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

**`src/app/api/folders/route.ts`**
- `GET`: call `listFolders(session.user.id)`, return `{ data: { folders } }`
- `POST`: parse body for `driveUrl`, get user's Drive access token from DB (`prisma.account.findFirst`), call `createFolder()`, then start ingestion in background (`startIngestion()` — do not await, fire and forget), return `{ data: { folder } }`

To get the access token:
```typescript
const account = await prisma.account.findFirst({
  where: { userId: session.user.id, provider: 'google' }
})
const accessToken = account?.access_token
```

**`src/app/api/folders/[folderId]/route.ts`**
- `GET`: call `getFolder(folderId, userId)`, return folder
- `DELETE`: call `deleteFolder(folderId, userId)`, return `{ data: { ok: true } }`

**`src/app/api/folders/[folderId]/ingest/route.ts`**
- `POST`: fetch folder from DB, get access token, call `startIngestion(folder, accessToken)` — fire and forget (don't await), return `{ data: { started: true } }` immediately

**`src/app/api/folders/[folderId]/status/route.ts`**
- `GET`: call `getIngestionStatus(folderId)`, return `{ data: { status } }`

**`src/app/api/folders/[folderId]/files/route.ts`**
- `GET`: `prisma.driveFile.findMany({ where: { folderId } })`, return `{ data: { files } }`

**`src/app/api/chat/route.ts`**

This is the most complex route. It must support streaming via Server-Sent Events (SSE).

```typescript
export async function POST(req: Request) {
  // 1. Auth check
  // 2. Parse { folderId, message, sessionId? } from body
  // 3. Create a ReadableStream
  // 4. Inside the stream:
  //    a. Call retrieve(message, folderId) — send debug info as SSE
  //    b. Call generateAnswer() with a token callback that sends each token as SSE
  //    c. After generation: send citations, metadata as SSE
  //    d. Send [DONE]
  //    e. Persist messages to DB
  // 5. Return: new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } })
}
```

SSE format (each line):
```
data: {"type":"token","payload":"word "}
data: {"type":"citations","payload":[...]}
data: {"type":"metadata","payload":{...}}
data: {"type":"debug","payload":{...}}
data: [DONE]
```

---

#### Step 4 — Fix package.json

Add `"geist": "^1.3.0"` to dependencies. The `layout.tsx` imports from `geist/font/sans` and `geist/font/mono`.

---

#### Step 5 — Create .env.local

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-prod
GOOGLE_CLIENT_ID=placeholder
GOOGLE_CLIENT_SECRET=placeholder
OPENAI_API_KEY=placeholder
DATABASE_URL=file:./dev.db
NEXT_PUBLIC_MOCK_MODE=true
```

With `NEXT_PUBLIC_MOCK_MODE=true` the app runs fully in mock mode — no real API calls, no DB needed. Demo-able immediately.

---

### Key patterns already established — follow these exactly

**Imports**: Always use `@/` path alias. Never use relative `../../` imports.

**Mock mode flag**: Every hook and API route checks `const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'`. In mock mode, return mock data from `src/lib/mock-data.ts` instead of hitting real APIs.

**API response shape**: Always wrap in `{ data: ... }` on success, `{ error: 'message' }` on failure. No naked objects.

**Styling**: Dark-first. Use `zinc-*` for neutrals, `indigo-*` for accent. Never use `gray-*`. All borders are `zinc-700` or `zinc-800`. Hover states add `zinc-800` background. Active/selected states use `indigo-500/10` background + `indigo-500/20` border.

**Animations**: Import variants from `@/constants/animations` (`fadeIn`, `slideUp`, `scaleIn`, `listContainer`, `listItem`, `messageCard`). Use `motion.div` from framer-motion. All interactive elements get `whileHover` and `whileTap`.

**Components**: All components are `'use client'`. No server components in the `components/` directory. Server-only code lives in `lib/`, `services/`, and `app/api/`.

**Types**: Import everything from `@/types` (the barrel export in `src/types/index.ts`). Never import from individual type files in components.

**Error handling**: Services and lib functions throw errors with descriptive messages. API routes catch them and return `{ error: err.message }` with the appropriate HTTP status.

**`nanoid` usage**: Use `generateId()` from `src/lib/utils.ts` for client-side IDs. `nanoid` is available but `generateId` wraps `Math.random().toString(36)` for SSR safety.

---

### Existing code to read before writing new files

Before writing services and API routes, read these files to understand the existing patterns and types:

| File | Why you need to read it |
|---|---|
| `src/lib/mock-data.ts` | Understand mock response shapes — services must return the same structure |
| `src/lib/retrieval.ts` | Understand `RetrievalResult` type that `chat-service.ts` consumes |
| `src/lib/answer-generator.ts` | Understand `GeneratedAnswer` type + streaming callback signature |
| `src/lib/google-drive.ts` | Understand `listFolderFiles()`, `exportGoogleFile()`, `downloadFile()` signatures |
| `src/lib/chunker.ts` | Understand `chunkText()` return type (`TextChunk[]`) |
| `src/lib/embeddings.ts` | Understand `EmbeddingProvider` interface + `embeddings` singleton |
| `src/lib/vector-store.ts` | Understand `VectorRecord` shape for upsert |
| `src/lib/auth.ts` | Understand `authOptions` export for NextAuth route |
| `src/types/index.ts` | All shared types |
| `src/store/ui-store.ts` | UI state atoms — don't duplicate any state here |
| `src/store/chat-store.ts` | Chat state atoms — services don't touch this; only hooks do |
| `src/hooks/useChat.ts` | Understand how the frontend consumes the SSE stream |

---

### What NOT to change

Do not modify any of these — they are finalized:

- All files in `src/components/` — UI is complete
- All files in `src/types/` — types are finalized
- All files in `src/store/` — stores are finalized
- All files in `src/hooks/` — hooks are finalized
- All files in `src/constants/` — animation config and constants are finalized
- `src/lib/utils.ts`, `src/lib/auth.ts`, `src/lib/prisma.ts` — finalized
- `prisma/schema.prisma` — finalized
- `tailwind.config.ts`, `next.config.ts` — finalized

---

### Verification checklist after building

Once all 15 files are written, verify:

1. `npm install` — succeeds (no missing packages)
2. `npx prisma db push` — succeeds (creates SQLite DB)
3. `npm run dev` — server starts without TypeScript errors
4. Open `http://localhost:3000` in mock mode — app renders the full shell
5. Click "Add folder" — modal opens, ingestion simulation runs, folder appears in sidebar
6. Click a suggested question — streaming answer appears with citation badges `[1][2][3]`
7. Hover a citation badge — matching source card in right panel highlights
8. Click a citation badge — source card expands showing exact chunk text with highlight
9. Click the "Debug" tab in right panel — retrieved chunks with scores appear
10. `npm run build` — production build succeeds

---

---

## Product Vision

Users can:
1. Authenticate with Google
2. Paste a Google Drive folder link
3. Ingest and index the folder contents (Docs, Sheets, PDFs, plain text)
4. Ask questions about the files in that folder
5. Receive grounded answers with inline citations
6. Inspect exact source chunks and retrieval evidence

The UI is a blend of Notion, Perplexity, and Linear: elegant, responsive, fast, with subtle motion and premium spacing.

---

## Original Spec

> Build a beautiful React web app where a user can authenticate with Google, paste in a Google Drive folder link, ingest and index the folder contents, ask questions about the files in that folder, receive grounded answers with citations, and inspect the sources and exact evidence used for the answer.
>
> The product should feel like a blend of Notion, Perplexity, and Linear: elegant, responsive, fast, subtle motion, premium spacing and typography, strong hover/click states, excellent touch response, smooth transitions, modern and highly polished.
>
> UX is top priority. Every interaction should feel intentional: soft hover elevation on cards, beautiful transitions, subtle glow/shadow changes, loading skeletons and staged progress indicators, pleasant microanimations, responsive layout, no clunky state changes.
>
> Citations should be interactive: hovering a citation highlights the matching source on the right panel. Clicking expands the source and scrolls to the exact chunk. Include a Debug tab showing retrieved chunks, similarity scores, and which were selected for final context. Show answer metadata (confidence, files used). Show suggested starter questions after indexing.
>
> Tech stack: Next.js App Router, TypeScript, Tailwind CSS, Framer Motion, shadcn/ui, Lucide icons, React Query, Zustand. Backend: Next.js API routes. Vector store: Prisma SQLite (dev-friendly, swappable). LLM: OpenAI GPT-4o + text-embedding-3-small.
>
> Modular structure: layout/, chat/, folders/, sources/, ui/, hooks/, lib/, services/, store/, types/, constants/. Business logic out of presentation components. Clean abstraction boundaries for EmbeddingProvider, VectorStore, FileParser.

---

## Architecture

### Data Flow

```
User pastes Drive URL
  → Validate + extract folder ID (lib/utils.ts: extractFolderIdFromUrl)
  → Fetch file list via Google Drive API (lib/google-drive.ts: listFolderFiles)
  → Parse each supported file (lib/file-parsers/: GoogleDocParser etc.)
  → Chunk text into overlapping segments (lib/chunker.ts: chunkText)
  → Embed each chunk via OpenAI (lib/embeddings.ts: embeddings.embedBatch)
  → Store chunk + embedding in Prisma (lib/vector-store.ts: vectorStore.upsert)
  → On query: embed question → cosine similarity search → top-K chunks
  → Generate answer via GPT-4o with citation prompt (lib/answer-generator.ts)
  → Return { answer, citations[], metadata, debug } (services/chat-service.ts)
  → SSE stream tokens to frontend (app/api/chat/route.ts)
  → Frontend renders answer with inline CitationBadge components
  → Citation hover → highlight source card (Zustand: ui-store.highlightedCitationId)
  → Citation click → expand source card, scroll to chunk
```

### State Architecture

- **Zustand `ui-store`**: `highlightedCitationId`, `expandedSourceId`, `rightPanelTab`, `rightPanelOpen`, `sidebarCollapsed`, `addFolderModalOpen`
- **Zustand `chat-store`**: `messages[]`, `activeFolderId`, `sessionId`, `isStreaming`, `currentCitations`
- **React Query**: used for server-state caching where needed (optional, hooks currently use plain fetch + useState)

### Abstraction Boundaries

```
EmbeddingProvider → OpenAIEmbeddingProvider | MockEmbeddingProvider   (lib/embeddings.ts)
VectorStore       → PrismaVectorStore                                  (lib/vector-store.ts)
FileParser        → registry pattern                                   (lib/file-parsers/index.ts)
```

---

## Complete File Tree

```
talk-to-a-folder/
├── README.md
├── .env.local.example
├── .gitignore
├── components.json
├── next.config.ts
├── package.json                     ← needs "geist" added to dependencies
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
│
├── prisma/
│   └── schema.prisma                ✅ complete
│
└── src/
    ├── app/
    │   ├── globals.css              ✅ complete
    │   ├── layout.tsx               ✅ complete
    │   ├── page.tsx                 ✅ complete
    │   ├── providers.tsx            ✅ complete
    │   └── api/
    │       ├── auth/[...nextauth]/
    │       │   └── route.ts         ❌ MISSING — trivial (4 lines)
    │       ├── folders/
    │       │   ├── route.ts         ❌ MISSING — GET list + POST create
    │       │   └── [folderId]/
    │       │       ├── route.ts     ❌ MISSING — GET + DELETE
    │       │       ├── ingest/
    │       │       │   └── route.ts ❌ MISSING — POST trigger ingestion
    │       │       ├── status/
    │       │       │   └── route.ts ❌ MISSING — GET ingestion status
    │       │       └── files/
    │       │           └── route.ts ❌ MISSING — GET file list
    │       └── chat/
    │           └── route.ts         ❌ MISSING — POST with SSE streaming
    │
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.tsx         ✅ complete
    │   │   ├── TopBar.tsx           ✅ complete
    │   │   ├── Sidebar.tsx          ✅ complete
    │   │   └── MainWorkspace.tsx    ✅ complete
    │   ├── chat/
    │   │   ├── ChatPanel.tsx        ✅ complete
    │   │   ├── ChatComposer.tsx     ✅ complete
    │   │   ├── MessageList.tsx      ✅ complete
    │   │   ├── UserMessage.tsx      ✅ complete
    │   │   ├── AssistantAnswer.tsx  ✅ complete
    │   │   ├── CitationBadge.tsx    ✅ complete
    │   │   ├── EmptyChat.tsx        ✅ complete
    │   │   └── AnswerMetadata.tsx   ✅ complete
    │   ├── folders/
    │   │   ├── AddFolderModal.tsx   ✅ complete
    │   │   ├── FolderCard.tsx       ✅ complete
    │   │   ├── FolderList.tsx       ✅ complete
    │   │   ├── FolderStatusPill.tsx ✅ complete
    │   │   └── IngestionProgress.tsx✅ complete
    │   ├── sources/
    │   │   ├── SourcesPanel.tsx     ✅ complete
    │   │   ├── SourceTabs.tsx       ✅ complete
    │   │   ├── SourceCard.tsx       ✅ complete
    │   │   ├── FolderTree.tsx       ✅ complete
    │   │   ├── DebugPanel.tsx       ✅ complete
    │   │   └── ChunkCard.tsx        ✅ complete
    │   └── ui/
    │       ├── button.tsx           ✅ complete
    │       ├── card.tsx             ✅ complete
    │       ├── badge.tsx            ✅ complete
    │       ├── skeleton.tsx         ✅ complete
    │       ├── tabs.tsx             ✅ complete
    │       ├── scroll-area.tsx      ✅ complete
    │       ├── tooltip.tsx          ✅ complete
    │       ├── dialog.tsx           ✅ complete
    │       ├── input.tsx            ✅ complete
    │       ├── textarea.tsx         ✅ complete
    │       ├── separator.tsx        ✅ complete
    │       ├── progress.tsx         ✅ complete
    │       ├── LoadingDots.tsx      ✅ complete
    │       └── AnimatedBorder.tsx   ✅ complete
    │
    ├── hooks/
    │   ├── useFolder.ts             ✅ complete
    │   ├── useFolders.ts            ✅ complete
    │   ├── useChat.ts               ✅ complete (mock streaming engine built in)
    │   ├── useIngestion.ts          ✅ complete
    │   └── useSourceHighlight.ts    ✅ complete
    │
    ├── lib/
    │   ├── utils.ts                 ✅ complete
    │   ├── auth.ts                  ✅ complete
    │   ├── prisma.ts                ✅ complete
    │   ├── mock-data.ts             ✅ complete (rich Q4 strategy mock folder + Q&A)
    │   ├── google-drive.ts          ✅ complete
    │   ├── chunker.ts               ✅ complete
    │   ├── embeddings.ts            ✅ complete
    │   ├── vector-store.ts          ✅ complete
    │   ├── retrieval.ts             ✅ complete
    │   ├── answer-generator.ts      ✅ complete
    │   └── file-parsers/
    │       ├── index.ts             ❌ MISSING — FileParser interface + registry
    │       ├── google-doc.ts        ❌ MISSING — plain text passthrough
    │       ├── google-sheet.ts      ❌ MISSING — CSV → readable text
    │       ├── pdf.ts               ❌ MISSING — pdf-parse wrapper
    │       └── plain-text.ts        ❌ MISSING — text/markdown/csv passthrough
    │
    ├── services/
    │   ├── folder-service.ts        ❌ MISSING — CRUD + DB writes
    │   ├── ingestion-service.ts     ❌ MISSING — full parse→chunk→embed→index pipeline
    │   └── chat-service.ts          ❌ MISSING — retrieval + generation orchestration
    │
    ├── store/
    │   ├── ui-store.ts              ✅ complete
    │   └── chat-store.ts            ✅ complete
    │
    ├── types/
    │   ├── index.ts                 ✅ complete
    │   ├── folder.ts                ✅ complete
    │   ├── chat.ts                  ✅ complete
    │   ├── retrieval.ts             ✅ complete
    │   └── api.ts                   ✅ complete
    │
    └── constants/
        ├── index.ts                 ✅ complete
        └── animations.ts            ✅ complete
```

---

## Setup

### Prerequisites
- Node.js 18+
- Google Cloud project with Drive API + OAuth 2.0 credentials
- OpenAI API key

### Install & Run

```bash
npm install
cp .env.local.example .env.local
# fill in credentials
npx prisma db push
npm run dev
```

### Demo Mode (no API keys needed)

```bash
# .env.local — set this one flag:
NEXT_PUBLIC_MOCK_MODE=true
```

Full UI flow works without any credentials: ingestion simulation, streaming chat with citations, source inspection, debug panel.

### Environment Variables

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
DATABASE_URL=file:./dev.db
NEXT_PUBLIC_MOCK_MODE=true
```

---

## Engineering Notes

**Citation ↔ source sync**: `CitationBadge` sets `ui-store.highlightedCitationId` on `onHoverStart`. `SourceCard` reads the same atom and applies a glowing border. This is why Zustand was chosen over Context — zero re-renders outside the two subscribing components.

**Vector store**: `PrismaVectorStore` stores embeddings as JSON strings in SQLite. Cosine similarity is computed in JS over the full result set. Acceptable for hundreds of chunks in dev. For production: implement `PineconeVectorStore` or use `pgvector` — the `VectorStore` interface in `lib/vector-store.ts` makes this a one-file swap.

**Streaming**: `useChat.ts` reads SSE tokens and appends them to `streamedContent` on the assistant message. The `AssistantAnswer` component renders `streamedContent` while `isStreaming` is true, then switches to `content` when done. A blinking cursor animates during streaming.

**Citation parsing**: The LLM is instructed to place `[N]` markers inline. `AssistantAnswer` splits the text on `\[(\d+)\]` and replaces each match with a `CitationBadge` component. The index maps to `citations[index - 1]`.

**Mock mode**: `NEXT_PUBLIC_MOCK_MODE=true` makes every hook bypass the real API and use `src/lib/mock-data.ts`. The mock includes a full "Q4 2024 Product Strategy" folder with 5 realistic files, 4 suggested questions, and 3 detailed Q&A pairs with citations and debug info. Word-by-word streaming is simulated with a variable-delay timer in `useChat.ts`.
