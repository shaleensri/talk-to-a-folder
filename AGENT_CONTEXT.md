# Agent Context — Talk to a Folder

**For AI agents continuing work on this project. Start here.**

The app is fully runnable end-to-end in production. Every layer is implemented — no scaffolding, no placeholders. Run locally with:

```bash
npm install && npx prisma db push && npm run dev
```

Demo mode (no credentials): `NEXT_PUBLIC_MOCK_MODE=true npm run dev`

---

## Current state (as of last session)

- Deployed to Vercel Hobby at `talk-to-a-folder-seven.vercel.app`
- PostgreSQL on Neon free tier (pooled connection string required)
- **Phase 1 complete and stable**: 3-column resizable layout (file tree | document viewer | chat)
- Two-level RAG index: per-file summaries at index time + chunk-level cosine search
- Intent classifier (gpt-4o-mini) routes queries to 5 strategies
- Query rewriter (gpt-4o-mini) always runs when history exists — rewrites follow-ups into self-contained queries, preserves explicit identifiers
- `single_file_deep` capped at 15 chunks via `queryFile()` cosine similarity (avoids 429 token limit)
- Keyword search fallback for numbered items (question 35, section 4 etc.) — matches ` N. ` pattern in PDF blobs
- `TOP_K_RETRIEVAL=20`, `TOP_K_CONTEXT=8` (increased from 8/5 to improve recall)
- Model told to admit when specific numbered item is not in retrieved chunks (prevents hallucination)
- Document viewer uses Google Drive iframe for all Office/Google formats — perfect rendering of colors, tables, indentation
- "Open in Google" button in viewer header for every file type
- Drag handles fixed — listeners in `useEffect` with `useRef` state, no stale closures or listener stacking
- Off-topic handled by a short gpt-4o-mini call (not a static canned response)
- File size limit: 20 MB enforced at ingestion time, shown as red dot tooltip in Files panel
- Ingestion uses `waitUntil` from `@vercel/functions` to survive Vercel Lambda lifecycle
- Progress tracking stored in `IndexedFolder.progressJson` (DB-backed, serverless-safe)

---

## Architecture overview

```
On index:
  Drive API → parse each file → chunk (1800c/200 overlap) → embed (text-embedding-3-small)
  → store chunks in TextChunk → generate 3-5 sentence summary via gpt-4o-mini → store in DriveFile.summary

On query:
  → [parallel] rewrite query using last 4 history turns (gpt-4o-mini, always-on when history exists,
     preserves explicit numbers/names)
  → [parallel] classify intent via gpt-4o-mini (broad_summary | single_file_deep | cross_folder_compare | targeted_fact | off_topic)
  → route to retrieval strategy:
      broad_summary / cross_folder_compare → getFileRepresentations() (summaries or chunk-0 fallback)
      single_file_deep → queryFile(embedding, fileId, 15) — top 15 chunks by cosine similarity, re-sorted by chunk index
      targeted_fact → cosine similarity across all folder chunks, balanced multi-folder selection, spread fallback
  → select system prompt by intent → generate answer (gpt-4o) → SSE stream
```

---

## Key files

| File | What it does |
|------|-------------|
| `src/lib/retrieval.ts` | Intent classifier, query rewriter (always-on), 4 retrieval strategies, normalizeFileName, findFileByName |
| `src/lib/answer-generator.ts` | Prompt selection by intent, off-topic LLM response, confidence scoring |
| `src/lib/vector-store.ts` | queryFile(embedding, fileId, topK) — cosine similarity scoped to one file |
| `src/services/ingestion-service.ts` | Full pipeline, parallel summary batches (batch=5), file size guard, DB-backed progress |
| `src/services/chat-service.ts` | History truncation (400 chars), retrieval+generation |
| `src/services/folder-service.ts` | updateFolderStatus clears progressJson on every status change |
| `src/app/api/folders/[folderId]/ingest/route.ts` | Guard against double-ingest, waitUntil for background completion |
| `src/app/api/folders/[folderId]/status/route.ts` | Reads progressJson from DB (serverless-safe), falls back to folder row |
| `src/app/api/files/[fileId]/preview/route.ts` | Returns text/pdf/table for plain text, CSV, PDF only. Office/Google formats rendered via iframe client-side |
| `src/app/api/files/[fileId]/preview/raw/route.ts` | Streams PDF bytes as ArrayBuffer for react-pdf |
| `src/components/layout/MainWorkspace.tsx` | 3-column resizable layout; drag listeners in useEffect + useRef (no stale closures or listener stacking) |
| `src/components/layout/FileTreePanel.tsx` | Left panel: folder expand/collapse, file click → doc viewer, re-index, delete, add folder |
| `src/components/viewer/DocumentViewer.tsx` | Center panel: Google Drive iframe for Office/Google formats; API fetch for text/PDF/CSV; "Open in Google" button |
| `src/components/viewer/PdfViewer.tsx` | react-pdf Document+Page, CDN worker URL, page nav + zoom |
| `src/components/viewer/TableViewer.tsx` | CSV/Excel table: sticky header, row numbers, filter input, sheet tabs |
| `src/components/chat/ChatPanel.tsx` | Right panel: ChatDropdown (all chats), FolderPills (folder context), new chat button |
| `src/components/chat/AssistantAnswer.tsx` | Inline sources (collapsible), custom markdown renderer: bold + citation badges |
| `src/hooks/useTabFolders.ts` | Multi-folder file list for active chat tab |
| `src/store/chat-store.ts` | tabs[], activeTabId, loadFromHistory() |
| `src/store/ui-store.ts` | openFileId, leftPanelWidth, rightPanelWidth, modal state, citation highlight |
| `src/constants/index.ts` | All tunable constants — chunk size, thresholds, model names, MAX_FILE_SIZE_BYTES |

---

## What was implemented in previous sessions

These are closed — do not re-implement:

- **Two-level index** — summaries at ingest + intent classifier + 4 retrieval strategies (broad_summary, single_file_deep, cross_folder_compare, targeted_fact)
- **Off-topic intent** — `off_topic` exits retrieval early, routes to a conversational gpt-4o-mini call for natural small talk responses
- **Transparent assumption** — single_file_deep queries prepend a brief "*Interpreting this as a question about [file]…*" note
- **File size guard** — files > 20 MB marked `skipped` with error message at ingestion; shown in Files panel tooltip
- **Multi-folder Files panel** — `useTabFolders` hook, `FolderTree` renders `folder…list, folder…list` for all active folders
- **single_file_deep capped at 15 chunks** — `queryFile(embedding, fileId, MAX_SINGLE_FILE_CHUNKS=15)` — cosine similarity scoped to file, re-sorted by chunk index. Prevents 429 token limit errors on large files.
- **normalizeFileName** — strips extension, lowercases, replaces `_-.` with spaces for fuzzy file matching
- **Query rewriter (always-on)** — runs on every message with history via gpt-4o-mini; expands follow-ups into self-contained queries; CRITICAL RULES preserve explicit numbers/names the user stated (never inherit from history)
- **History truncation** — assistant messages in history capped at 400 chars to prevent prior long answers polluting follow-up responses
- **Intent classifier improvements** — off_topic examples tightened to pure greetings only; analytical/evaluative questions explicitly mapped to targeted_fact; "when in doubt, targeted_fact" rule added; single_file_deep only for full-file overview requests
- **Inline bold rendering** — `parseWithCitations` splits on `**...**` and `[N]` in one pass, renders bold as `<strong>`
- **Production deployment** — Vercel Hobby + Neon PostgreSQL
- **DB-backed progress** — `progressJson String?` on `IndexedFolder`; `setProgress` is fire-and-forget; `updateFolderStatus` clears progressJson on every call
- **`waitUntil`** — `@vercel/functions` `waitUntil()` wraps ingestFolder so Lambda stays alive post-202
- **Double-ingest guard** — ingest route returns 202 early if folder already `ingesting`
- **Neon pooler** — must use pooled connection string for serverless (avoids autosuspend connection errors)
- **`prisma generate` in build** — `"build": "prisma generate && next build"` in package.json
- **Phase 1 — 3-column layout** — `MainWorkspace` with dual DragHandle dividers; LEFT_MIN=180/MAX=360, RIGHT_MIN=300/MAX=520
- **FileTreePanel** — left panel; folder expand/collapse; file click → `setOpenFileId`; re-index per folder; delete folder; + button for AddFolderModal
- **DocumentViewer** — center panel; fetches `/api/files/[fileId]/preview`; renders text/html/pdf/table; SSR-safe dynamic import for PdfViewer
- **PdfViewer** — react-pdf with CDN worker (`https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`); page nav + zoom; text layer enabled
- **TableViewer** — sticky-header table for CSV/Excel; row numbers; filter input; sheet tabs for multi-sheet Excel
- **Preview API** — `GET /api/files/[fileId]/preview` returns JSON: text/html/pdf/table/unsupported. `GET /api/files/[fileId]/preview/raw` streams PDF bytes
- **ChatPanel redesign** — ChatDropdown (all chats, switch/close), FolderPills (add/remove folder context), PenSquare new chat button
- **Inline sources** — collapsible "N sources" toggle per assistant message using ChevronDown + AnimatePresence; overflow fixed with `break-words` + `overflow-x-hidden`
- **Google Drive iframe viewer** — DOCX, Google Docs, Google Sheets, Google Slides, PPTX, XLS all render via `drive.google.com/file/d/{id}/preview`; replaces broken mammoth → HTML path for viewer (mammoth still used in ingestion pipeline)
- **"Open in Google" button** — in every file's viewer header; routes to the correct Google service by mimeType (Docs/Sheets/Slides edit URL, Drive view for others)
- **Keyword search for numbered items** — `retrieveTargetedFact` runs keyword search in parallel with cosine similarity; matches ` N. ` pattern in TextChunk.text; results merged at front with score 0.99
- **Anti-hallucination prompt rule** — CITATION_SYSTEM_PROMPT rule 6: if specific numbered item not in retrieved chunks, say so explicitly; never substitute a different numbered item
- **TOP_K_RETRIEVAL=20, TOP_K_CONTEXT=8** — increased from 8/5 to improve recall on large uniform documents
- **Drag handle fix** — `useEffect` adds `mousemove`/`mouseup` to window once; `useRef` holds drag origin; no stale closures, no listener stacking

---

## Patterns — follow these exactly

**Imports**: Always `@/` alias. Never relative `../../`.

**Mock mode**: `const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'` — every hook and route checks this.

**API response shape**: `{ data: ... }` on success, `{ error: 'message' }` on failure.

**Styling**: `zinc-*` for neutrals, `indigo-*` for accent. Never `gray-*`. Active states: `indigo-500/10` bg + `indigo-500/20` border.

**Types**: Import from `@/types` barrel. Never from individual type files.

**Components**: All `'use client'`. Server-only code lives in `lib/`, `services/`, `app/api/`.

**Progress writes**: Always fire-and-forget (no `await setProgress(...)`). The critical status is written by `updateFolderStatus` which is always awaited.

**Serverless background work**: Always use `waitUntil()` from `@vercel/functions`. Never plain fire-and-forget `.catch()` on Vercel.

---

## Do not touch (stable, well-tested)

- `src/constants/animations.ts` — Framer Motion variants
- `src/lib/chunker.ts`, `src/lib/embeddings.ts`
- `tailwind.config.ts`, `next.config.mjs`
- All test files under `tests/`

---

## Next to build

### Phase 2 — Text Selection + Ask Chat
Per the doc_viewer_functionality.yaml plan:
- Text highlight in DocumentViewer → mouseup popover with "Ask chat" and "Copy"
- "Copy" → clipboard
- "Ask chat" submenu: 0 matches → auto-create new chat with folder context; 1+ matches → show submenu listing matching chats + "New chat" option pinned at bottom
- Selected text appears as a quoted block in the chat composer (grey, styled like Claude/ChatGPT references)
- Quoted text prepended to outgoing message when sent
- Text selection only works on rendered text (PDF text layer already enabled)

---

## Known gaps — what to build next

### pgvector
Embeddings are stored as JSON strings in a `Text` column; cosine similarity is computed in-app by iterating all chunks. This works fine up to ~10k chunks. For scale, migrate to Neon's pgvector extension:
- Add `pg_vector` extension in Neon
- Change `embedding String?` to `embedding Unsupported("vector(1536)")?` in schema
- Implement `PgVectorStore` in `src/lib/vector-store.ts` using `<=>` operator
- Swap the export — no other file needs to change

### Large folder ingestion on Hobby
Vercel Hobby has a 30s function timeout. `waitUntil` extends this but it's still capped. Folders with 50+ files or large PDFs may not finish within 30s. Upgrade to Vercel Pro (300s) or move ingestion to a separate worker (Railway, Fly.io) for production scale.

### Additional file formats
No OCR for image-only PDFs, no email (.eml), no HTML, no RTF.

### Sharing / multi-user folders
All indexed folders are private to the authenticated user. Shared workspaces would require a team/org model.

### Streaming ingestion progress to UI
Currently the UI polls `/status` every 1.5s. A WebSocket or SSE stream from the ingest endpoint would give real-time per-file updates without polling overhead.

---

## Environment variables (production)

```
DATABASE_URL          → Neon pooled connection string (...-pooler.neon.tech/...?sslmode=require)
OPENAI_API_KEY        → OpenAI key
GOOGLE_CLIENT_ID      → Google OAuth client ID
GOOGLE_CLIENT_SECRET  → Google OAuth client secret
NEXTAUTH_SECRET       → random base64 string (openssl rand -base64 32)
NEXTAUTH_URL          → https://talk-to-a-folder-seven.vercel.app
```

Local dev can use Neon or a local Postgres. SQLite no longer supported (schema provider = postgresql).

---

## Deployment commands

```bash
vercel --prod               # deploy
vercel logs <url>           # runtime logs (or use Vercel dashboard)
npx prisma db push          # sync schema to Neon (no migration file needed)
npx prisma studio           # browse DB locally
```

If folders get stuck on `ingesting` in production, fix via Neon SQL editor:
```sql
UPDATE "IndexedFolder" SET status = 'indexed', "progressJson" = null WHERE status = 'ingesting';
```
