# Talk to a Folder

A RAG (Retrieval-Augmented Generation) web app that connects to a Google Drive folder and lets you have a grounded, cited conversation with its contents. Ask questions, get summaries, compare documents — all with inline citations pointing back to the exact source.

**Live:** [talk-to-a-folder-seven.vercel.app](https://talk-to-a-folder-seven.vercel.app)

---

## What it does

1. Sign in with Google OAuth
2. Paste a Google Drive folder link — the app recursively crawls all files including subfolders
3. Files are parsed, chunked, embedded, and indexed — with an LLM summary generated per file
4. Ask questions in natural language — answers stream back with inline citation markers `[1][2][3]`
5. Hover citations to highlight the source card; open the Debug tab to see cosine scores and retrieval latency

---

## How to run

The app is live at [talk-to-a-folder-seven.vercel.app](https://talk-to-a-folder-seven.vercel.app). Sign in with a Google account that has access to a Drive folder and paste the folder link to get started.

To run locally, clone the repo, copy `.env.local.example` to `.env.local`, fill in your Google OAuth credentials, OpenAI API key, and PostgreSQL connection string, then:

```bash
npm install
npx prisma db push
npm run dev
```

A mock mode is available with no credentials required:
```bash
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 14 App Router | Full-stack in one repo — API routes colocated with UI, deploys to Vercel in one command |
| Auth | NextAuth v4 + Google OAuth | Handles token refresh, session persistence, and the Drive OAuth scope out of the box |
| Database | Prisma + PostgreSQL (Neon) | Serverless-compatible, free tier, works with Vercel's ephemeral functions |
| Embeddings | OpenAI `text-embedding-3-small` | 1536 dimensions, cheap at scale ($0.00002/1K tokens) |
| LLM — routing | OpenAI `gpt-4o-mini` | Fast and cheap for intent classification and query rewriting (~$0.0002/call) |
| LLM — answers | OpenAI `gpt-4o` | Reserved for final answer generation where quality matters |
| UI | Tailwind CSS + shadcn/ui + Framer Motion | Rapid component development with consistent design language |
| State | Zustand | Lightweight, no boilerplate, supports tab-scoped state per chat session |
| Hosting | Vercel | Zero-config deploys, `waitUntil` keeps background ingestion alive |

---

## Architecture

### Ingest (one-time per folder)

```
Google Drive  →  Parse  →  Chunk (1800c / 200 overlap)  →  Embed  →  PostgreSQL
(Drive API)     pdf/docx                                   3-small    chunks +
                xlsx/csv                                              embeddings
                gsheet/txt
                   │
                   └─ gpt-4o-mini per file → LLM Summary → PostgreSQL
```

Ingestion runs as a fire-and-forget background job using Vercel's `waitUntil` so the HTTP response returns immediately while parsing continues. Progress is polled from the DB every 1.5 seconds and shown as a live progress bar.

### Query (every question)

```
User question
     │
     ▼
Query Rewriter (gpt-4o-mini)  ←── last 6 messages of conversation history
     │  resolves "that file" / "tell me more about it" into self-contained queries
     ▼
Intent Classifier (gpt-4o-mini)
     │
     ├─ targeted_fact      → cosine similarity over all chunks (top-K)
     ├─ broad_summary      → pre-generated file summaries (all files, no vector search)
     ├─ single_file_deep   → all chunks for the named file (up to 15, queryFile())
     └─ cross_folder_cmp   → balanced multi-folder retrieval with per-folder minimums
                                      │
                                      ▼
                              GPT-4o Answer Generator
                                      │
                                      ▼
                              SSE stream → Answer [1][2][3]
```

Two models, two jobs: `gpt-4o-mini` handles cheap routing and rewriting; `gpt-4o` handles quality generation.

---

## Features

### Smart retrieval pipeline

- **Intent classification** — gpt-4o-mini classifies each query into one of four strategies before retrieval even starts. A "summarize everything" question and a "what is the payment term" question are routed completely differently.
- **Query rewriting** — follow-up questions like "tell me more about that file" resolve to self-contained queries using conversation history, before hitting the embedding model. Preserves explicit identifiers ("question 35", "section 4") so they are never mangled by the rewriter.
- **Per-file LLM summaries** — generated at index time using gpt-4o-mini. Broad summary queries use these directly — every file is represented without cosine search being involved at all.
- **Single file deep dive** — if the classifier identifies a question about one specific file, retrieval is pinned to that file's chunks (`queryFile()`) up to 15 chunks, preventing token limit errors on large files.
- **Cross-folder comparison** — multiple folders can be added to one chat tab. Retrieval balances chunks across folders with a guaranteed minimum per folder. Answers label each chunk `[Folder: Name]`.
- **Keyword search fallback** — runs in parallel with cosine similarity for numbered references ("question 35", "section 3.1") — handles uniform documents like exam papers where all chunks embed to similar vectors.
- **Anti-hallucination guard** — the model is explicitly instructed to admit when a specific numbered item is not in the retrieved chunks rather than substituting a different one.
- **Assumption display** — when the system makes an interpretation call (e.g. routing "explain the report" to `Report.pdf`), a visible note tells the user what assumption was made.

### Document viewer

- Three-column resizable layout: file tree | document viewer | chat. All three dividers are drag-to-resize with min/max bounds.
- **PDF** — rendered with react-pdf, page navigation, zoom in/out
- **CSV / Excel** — sortable, filterable table. Excel files show a sheet picker for multi-sheet workbooks.
- **DOCX / PPTX** — converted to HTML via mammoth / officeparser, rendered inline. Color and background-color styles stripped to prevent invisible text on dark backgrounds.
- **Google Docs / Sheets / Slides** — embedded as an authenticated Drive iframe for perfect formatting, fonts, and tables.
- **Plain text / Markdown** — rendered directly.
- "Open in Google" button on every file — routes to the appropriate Google editor.

### Text selection → ask chat

Select any text in the document viewer, and a popover appears with two options:
- **Ask chat** — the selected text is quoted in the chat composer, and the file's ID is pinned to the retrieval call so the answer is grounded in that specific document. If multiple chat tabs are open for the folder, a submenu lets you choose which tab receives the quote.
- **Copy** — copies to clipboard.

Google Docs/Sheets/Slides render in a cross-origin iframe, so text selection is unavailable. For DOCX files, a "Enable text selection" toggle re-fetches the file as plain HTML so selection works.

### Chat

- SSE streaming — tokens appear in real time
- Inline citation badges that sync with source cards on hover
- Collapsible source panel under each assistant message showing chunk text, file name, and cosine score
- Debug tab showing retrieval latency, total chunks retrieved, selected chunk IDs, and scores
- Multiple chat tabs — each tab can hold multiple folders
- Folder context pills on each tab — add or remove folders without creating a new chat
- Chat history persisted to the DB and restored on page reload
- Rate limiting: 20 questions/user/60 seconds

### Ingestion

- Recursive folder crawl up to 5 levels deep including subfolders
- Files over 20 MB skipped with a visible error in the Files panel
- Legacy formats (`.doc`, `.ppt`) flagged with a clear conversion message rather than a cryptic parser error
- Image-only PDFs and scanned documents marked as skipped with reason shown
- Re-index per folder — deduplicates by Drive file ID so re-indexing doesn't create duplicate rows
- Staleness badge on folder cards when last index is more than 24 hours ago
- Google OAuth access token auto-refreshed using stored refresh token (1-hour expiry handled transparently)
- Google Drive export API failures retried once after 2 seconds

### File formats supported

| Format | Parser |
|--------|--------|
| Google Docs | Drive API HTML export |
| Google Sheets | Drive API CSV export |
| PDF | pdf-parse |
| Word (.docx) | mammoth |
| Excel (.xlsx) | SheetJS |
| PowerPoint (.pptx) | officeparser |
| Plain text / Markdown / CSV | passthrough |

---

## Notable bugs found and fixed

These are real bugs discovered during development, not hypothetical cases.

| # | Bug | Root cause | Fix |
|---|-----|-----------|-----|
| 1 | Re-indexing doubled the file count in the DB | `nanoid()` generated a new ID for every Drive file on every crawl; Prisma treated each as a new insert | Look up existing rows by `driveFileId` before upsert; reuse existing DB IDs |
| 2 | "Index now" button never appeared after a failed index | Button only rendered when `status === 'error'`; failed-with-no-files returned `status === 'indexed'` | Flip: show button whenever `status !== 'ingesting'` |
| 3 | Re-index spinner never stopped | POST /ingest returns 202 immediately; component assumed indexing was done | Poll `GET /status` every 1.5 seconds until `indexed` or `error`, then stop |
| 4 | "Couldn't find evidence" on all questions | `MIN_RELEVANCE_SCORE = 0.65` calibrated for ada-002; `text-embedding-3-small` scores 0.35–0.50 for good matches | Recalibrate to `0.30` |
| 5 | Confidence always showed "Low" | Same threshold mismatch — `high ≥ 0.85` never reachable with 3-small | Recalibrate: `high ≥ 0.60`, `medium ≥ 0.45` |
| 6 | Follow-up questions had no memory of prior answers | `useChat.ts` never sent `sessionId`; server created a new session every request | Read and persist `sessionId` from Zustand; send on every request |
| 7 | Broad questions ("summarize everything") used only one file | Cosine similarity clustered on the highest-scoring file; other files never appeared | Spread strategy: below score threshold, pick best chunk per unique file |
| 8 | Summarization still showed one section of one file | Spread strategy still cosine-based; one file dominated; wrong system prompt told model to be "concise and cite" | Bypass cosine: fetch `chunkIndex=0` from every file. Use summarization-specific system prompt. |
| 9 | Follow-up questions ("that file") failed retrieval | Pronouns embed to generic vectors with no connection to prior conversation | Query rewriting: gpt-4o-mini resolves references using last 6 messages before retrieval |
| 10 | Google access token expired mid-session | App read `access_token` directly from DB without checking expiry | `getValidAccessToken()` checks expiry (60s buffer), auto-refreshes via refresh token |
| 11 | `.pptx` parser always crashed | `officeparser` v6 renamed `parseOfficeAsync` → `parseOffice`; now returns AST with `.toText()` | Update call; call `.toText()` on result |
| 12 | `.doc` / `.ppt` files gave confusing library errors | OLE2 binary format fed to OOXML parser | Throw early with "convert to .docx/.pptx" message |
| 13 | Chat history lost on page reload | `ChatSession` had no `userId`; store was pure in-memory Zustand | Added `userId` to schema, `GET /api/sessions`, `loadFromHistory` action in store, hydration on sign-in |
| 14 | Source dots hidden by scroll bar | Fixed panel width with no resize | Drag-to-resize panel dividers |
| 15 | `setActiveFolderId is not a function` crash | Zustand action removed during multi-tab refactor; import reference not updated | Replace with `addTab` at all call sites |
| 16 | `messages is not iterable` on page load | `SourceTabs` read flat `messages` from store; refactor moved messages inside tab objects | Read from `tabs.find(activeTabId).messages` |
| 17 | Invisible text in DOCX previews | mammoth preserves `color: white` / `background-color: black` from Word documents | Strip `color` and `background-color` from all inline styles in the HTML output |
| 18 | Hooks called inside JSX caused compile error | `useTransform` from Framer Motion called inside a `style` prop expression | Move `useTransform` calls to component top level |

---

## Future improvements

**Quick wins (one-file changes)**
- **pgvector** — swap `vector-store.ts` to use PostgreSQL's native vector type. Cosine similarity moves from in-app JavaScript to an indexed DB operation. One schema migration, one query change.
- **Streaming ingestion progress** — replace DB polling with SSE so the progress bar updates in real time.
- **Re-index single file** — button on each file row to re-parse and re-embed just that file.
- **Image OCR** — pass images through GPT-4 Vision at index time; currently image-only PDFs are skipped.

**Meaningful features**
- **Hybrid search** — combine cosine similarity with BM25 keyword search. Better recall for names, codes, and exact phrases that cosine misses.
- **Re-ranking** — retrieve top-20 with cosine, re-rank with a cross-encoder, send top-5 to GPT-4o. Better precision without increasing token cost.
- **Incremental ingestion** — subscribe to Drive push notifications (webhooks) and re-embed only changed files. Currently a full re-index is required.
- **Chunk size per file type** — 1800 characters is right for prose, wrong for spreadsheets (one row = one chunk) and code. Detect and apply format-specific chunking strategies.
- **Folder sharing** — all folders are private to the authenticated user. A share link would give read-only chat access without requiring the recipient to authenticate with Drive.

**Architectural**
- **Multi-modal indexing** — index slide decks as images, not just extracted text. Charts and diagrams are invisible to the current text pipeline.
- **Write-back** — upgrade from `drive.readonly` to `drive` scope, enable "suggest edits to this document" mode.

---

## Tests

```bash
npm run test:unit         # pure helpers, chunking, parser cleanup (29 tests)
npm run test:functional   # mocked API routes, services, retrieval, answer generator (92 tests)
npm run test:smoke        # file/API/service structure and export checks (7 tests)
npm run test:integration  # real Prisma queries against a test DB (requires DATABASE_URL)
```

**128 tests, 0 failures** (functional + unit + smoke).

Tests use Node.js's built-in test runner with no additional framework. Module dependencies are mocked via `Module._load` interception and `require.cache` injection — the latter is necessary for modules that use relative imports or dynamic `await import()` calls, which `Module._load` cannot intercept after it has been restored.
