# Talk to a Folder

A RAG (Retrieval-Augmented Generation) web app that connects to a Google Drive folder and lets you have a grounded, cited conversation with its contents. Ask questions, get summaries, compare documents — all with inline citations pointing back to the exact source.

Live: [talk-to-a-folder-seven.vercel.app](https://talk-to-a-folder-seven.vercel.app)

---

## What it does

1. **Sign in** with Google OAuth
2. **Paste a Google Drive folder link** — the app lists all supported files including subfolders
3. **Index** — files are parsed, chunked, embedded, and stored
4. **Chat** — ask questions; answers stream back with inline citation markers `[1][2][3]`
5. **Inspect** — hover citations to highlight source cards; open the Debug tab to see chunk scores

---

## Features

**Smart retrieval**
- Intent classification (gpt-4o-mini) routes each query to the right strategy: broad summary, single file deep dive, cross-folder comparison, or targeted fact retrieval
- Per-file LLM summaries stored at index time for fast overview queries
- Cosine similarity search with spread fallback for broad questions
- Query rewriter (gpt-4o-mini, always-on) expands follow-ups into self-contained queries — preserves explicit identifiers (e.g. "question 35" never gets replaced by prior context)
- `single_file_deep` capped at 15 most-relevant chunks via `queryFile()` to prevent token limit errors on large files
- Keyword search fallback for numbered items (question N, section N) runs in parallel with cosine similarity — handles uniform documents like exam papers
- Anti-hallucination rule: model admits when a specific numbered item isn't in retrieved chunks rather than substituting a different one
- Transparent assumption display when the system makes an interpretation call

**Document viewer**
- 3-column resizable layout: file tree | document viewer | chat
- Left panel: folder tree with expand/collapse, click file to preview, re-index per folder, add/delete folders
- Center panel: full document preview — plain text, Markdown, PDF (react-pdf with page nav + zoom), CSV/Excel (sortable table with filter), Google Docs / DOCX / Sheets / Slides / PPTX (Google Drive iframe — perfect colors, tables, fonts)
- "Open in Google" button in every file's header — routes to Docs/Sheets/Slides editor or Drive viewer
- Right panel: chat with dropdown to switch between chats, folder context pills (add/remove folders per chat), inline collapsible sources per answer

**File support**
| Format | Parser |
|--------|--------|
| Google Docs | Drive API export |
| Google Sheets | Drive API export → CSV |
| PDF | pdf-parse |
| Plain text / Markdown / CSV | passthrough |
| Word (.docx) | mammoth |
| Excel (.xlsx) | SheetJS |
| PowerPoint (.pptx) | officeparser |

Files over 20 MB are skipped with a visible error in the Files panel.

**Multi-folder chat**
- Add multiple folders to a single chat tab
- Balanced retrieval across folders (minimum representation per folder)
- Each chunk labeled `[Folder: Name]` in cross-folder answers

**UI**
- SSE streaming with real-time token display
- Inline citation badges that sync with source cards on hover
- Collapsible inline sources under each assistant message
- All three panels drag-to-resize with min/max bounds
- Staleness badge on folder cards (> 24h since last index)
- File error tooltips on hover in the Files panel
- Chat dropdown to switch between all chats; only one chat visible at a time
- Chat history persisted in DB and restored on page reload

**Deployment**
- Hosted on Vercel (Hobby plan)
- PostgreSQL via Neon (free tier)
- Progress tracking stored in DB (serverless-safe, no shared memory)
- `waitUntil` keeps Lambda alive through full ingestion

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 App Router |
| Auth | NextAuth v4 + Google OAuth |
| Database | Prisma + PostgreSQL (Neon) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o` + `gpt-4o-mini` |
| UI | Tailwind CSS + shadcn/ui + Framer Motion |
| State | Zustand |
| Hosting | Vercel |

---

## File structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── chat/route.ts              SSE streaming endpoint
│   │   ├── folders/
│   │   │   ├── route.ts               GET list, POST create
│   │   │   └── [folderId]/
│   │   │       ├── route.ts           GET, DELETE
│   │   │       ├── ingest/route.ts    POST trigger (waitUntil)
│   │   │       ├── status/route.ts    GET progress (DB-backed)
│   │   │       └── files/route.ts     GET file list
│   │   ├── files/[fileId]/
│   │   │   ├── preview/route.ts       GET renderable content (text/html/pdf/table)
│   │   │   └── preview/raw/route.ts   GET raw PDF stream for react-pdf
│   │   └── sessions/route.ts          GET recent sessions (history restore)
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── providers.tsx
│
├── components/
│   ├── layout/        AppShell, TopBar, MainWorkspace, FileTreePanel, IntroAnimation
│   ├── viewer/        DocumentViewer, PdfViewer, TableViewer
│   ├── chat/          ChatPanel, ChatComposer, MessageList, AssistantAnswer, CitationBadge
│   ├── folders/       AddFolderModal, FolderCard, FolderList, FolderStatusPill, IngestionProgress
│   ├── sources/       SourcesPanel, SourceTabs, SourceCard, FolderTree, DebugPanel
│   └── ui/            TiltCard, LoadingDots, shadcn components
│
├── hooks/
│   ├── useChat.ts          SSE stream reader, sessionId persistence
│   ├── useFolders.ts
│   ├── useFolder.ts
│   ├── useTabFolders.ts    Multi-folder file list for active tab
│   ├── useIngestion.ts
│   └── useSourceHighlight.ts
│
├── lib/
│   ├── retrieval.ts        Intent classifier + 4 retrieval strategies
│   ├── answer-generator.ts GPT-4o, prompts per intent, confidence scoring
│   ├── vector-store.ts     Prisma/PostgreSQL vector backend (cosine in-app)
│   ├── chunker.ts          1800 chars / 200 overlap
│   ├── embeddings.ts       text-embedding-3-small
│   ├── google-drive.ts     Recursive folder walk, subfolder support
│   ├── google-auth.ts      Auto token refresh
│   ├── auth.ts
│   ├── prisma.ts
│   └── file-parsers/       index, google-doc, google-sheet, pdf, plain-text, word, excel, powerpoint
│
├── services/
│   ├── folder-service.ts   CRUD + updateFolderStatus (clears progressJson on change)
│   ├── ingestion-service.ts parse → chunk → embed → index → summarize pipeline
│   └── chat-service.ts     Query rewriting, retrieval + generation, history injection
│
├── store/
│   ├── chat-store.ts       tabs[], activeTabId, loadFromHistory
│   └── ui-store.ts         panel state, modal state, citation highlight
│
├── types/                  Barrel export from index.ts
└── constants/
    ├── index.ts            Limits, thresholds, model names
    └── animations.ts       Framer Motion variants
```

---

## Local setup

### Prerequisites
- Node.js 18+
- Google Cloud project with Drive API + OAuth 2.0 (`drive.readonly` scope)
- OpenAI API key
- PostgreSQL database (Neon free tier works)

### Install & run

```bash
npm install
cp .env.local.example .env.local
# fill in credentials
npx prisma db push
npm run dev
```

### Environment variables

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
DATABASE_URL=postgresql://...?sslmode=require
NEXT_PUBLIC_MOCK_MODE=false
```

### Demo mode (no credentials)

```bash
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

Full UI with simulated ingestion, streaming, and citations. No API keys needed.

---

## Production deployment (Vercel + Neon)

1. Create a Neon project and copy the **pooled** connection string
2. Run `npx prisma db push` against Neon
3. `vercel` — follow prompts, link GitHub repo
4. Add env vars in Vercel dashboard (use pooled Neon URL for `DATABASE_URL`)
5. Add `https://your-app.vercel.app/api/auth/callback/google` to Google OAuth redirect URIs
6. `vercel --prod`

---

## What's not done yet

| Gap | Notes |
|-----|-------|
| pgvector | Embeddings stored as JSON strings; cosine computed in-app. For scale: swap to pgvector on Neon — one-file change in `vector-store.ts` |
| Ingestion timeout on large folders | Hobby plan: 30s limit. Large folders (50+ files) may not complete. Upgrade to Vercel Pro for 300s |
| Additional file formats | No image OCR, no email (.eml), no HTML |
| Sharing / collaboration | All folders are private to the authenticated user |

---

## Tests

```bash
npm test                  # all tests
npm run test:unit         # pure helpers, chunking, parser cleanup
npm run test:functional   # mocked API routes, services, retrieval, answer generator
npm run test:smoke        # file/API/service structure checks
npm run test:blackbox     # public behavior of store and parsers
npm run test:integration  # real Prisma queries against a test DB
```

Current status: 49 unit/functional/smoke/blackbox tests + 28 integration tests, 0 failures.
