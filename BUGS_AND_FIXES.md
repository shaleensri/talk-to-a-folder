# Bugs Found & Fixed

A log of every real bug discovered during development and testing of Talk to a Folder, with root cause analysis and the fix applied. Ordered roughly chronologically.

---

## 1. Duplicate files created on every re-index

**Symptom**
Re-indexing a folder doubled the file count each time. After two re-indexes of a 5-file folder, the DB had 10 DriveFile rows, then 20.

**Root cause**
`listFolderFiles` (Google Drive API wrapper) generated a new `id` via `nanoid()` for every file on every call. `upsertFiles` used that `id` as the upsert key. Since the ID was new each time, Prisma treated it as an insert, not an update — creating a second row for the same Drive file.

**Fix**
Before upserting, look up existing `DriveFile` rows for the folder and build a map of `driveFileId → existing DB id`. Reuse the existing DB id if the file has been seen before, so the upsert hits the update path instead of insert.

```typescript
// src/services/folder-service.ts
const existing = await prisma.driveFile.findMany({
  where: { folderId: folder.id },
  select: { id: true, driveFileId: true },
})
const existingMap = new Map(existing.map((f) => [f.driveFileId, f.id]))
const files = driveFiles.map((f) => ({
  ...f,
  id: existingMap.get(f.driveFileId) ?? f.id,
}))
```

---

## 2. "Index now" button never appeared

**Symptom**
After a failed ingestion, the folder card showed no way to retry. The "Index now" / "Re-index" button was invisible.

**Root cause**
The button was conditionally rendered only when `folder.status === 'error'`. But after a failed ingestion where no files were parsed, the folder status was `'indexed'` (with `fileCount: 0`) rather than `'error'` — so the condition never matched.

**Fix**
Flip the condition: show the button whenever status is NOT `'ingesting'`. This covers idle, indexed, and error states.

```tsx
// src/components/folders/FolderCard.tsx
{folder.status !== 'ingesting' && (
  <button onClick={handleReindex}>...</button>
)}
```

---

## 3. Re-index spinner never stopped

**Symptom**
Clicking "Re-index" triggered the spinner, which kept spinning indefinitely even after indexing completed.

**Root cause**
`POST /api/folders/[id]/ingest` returns HTTP 202 immediately (fire-and-forget). The component called this endpoint, saw a success response, and assumed indexing was done — but indexing was still running in the background. There was no polling.

**Fix**
After the POST, poll `GET /api/folders/[id]/status` every 1.5 seconds until the status is `'indexed'` or `'error'`, then stop the spinner and call the refresh callback.

```typescript
// src/components/folders/FolderCard.tsx
const poll = async (): Promise<void> => {
  const res = await fetch(`/api/folders/${folder.id}/status`)
  const data = await res.json()
  const status = data.status?.status ?? data.status
  if (status === 'indexed' || status === 'error') {
    onReindex?.(folder)
    return
  }
  await new Promise((r) => setTimeout(r, 1500))
  return poll()
}
await poll()
```

---

## 4. "Couldn't find strong evidence" on all questions

**Symptom**
Every question returned "Couldn't find strong evidence in your documents" even when the answer was clearly in the files.

**Root cause**
`MIN_RELEVANCE_SCORE` was set to `0.65` — calibrated for `text-embedding-ada-002`. The app uses `text-embedding-3-small`, which produces lower absolute cosine similarity scores for the same semantic content. Scores of 0.35–0.50 are perfectly good matches for this model, but they were all being rejected.

**Fix**
Lower the thresholds to match the model's score distribution.

```typescript
// src/constants/index.ts
export const MIN_RELEVANCE_SCORE = 0.30        // was 0.65
export const UNSUPPORTED_SCORE_THRESHOLD = 0.20 // was 0.50
```

---

## 5. Files panel didn't refresh after re-index

**Symptom**
After re-indexing, the folder card updated to show the new file count, but the right-panel Files tab still showed the old list.

**Root cause**
`useFolder` loaded files once on mount with no way to trigger a reload. The `load()` function was defined inside the hook but not exposed in the return value.

**Fix**
Extract `load()` as a named function and export it as `refetch`.

```typescript
// src/hooks/useFolder.ts
async function load() { /* fetch files */ }
return { files, isLoading, refetch: load }
```

---

## 6. Follow-up questions had no memory of prior answers

**Symptom**
The LLM had no awareness of previous messages. Every question was answered as if it were the first in the conversation.

**Root cause**
`useChat.ts` never sent `sessionId` in the request body. The server created a new session for every request, so no conversation history was ever loaded.

**Fix**
Read `sessionId` from the Zustand chat store and send it on every request. Capture the `sessionId` returned in the `done` SSE chunk and store it back.

```typescript
// src/hooks/useChat.ts
body: JSON.stringify({ folderId, message: content, sessionId }),

// on done chunk:
setSessionId(chunk.payload.sessionId)
```

---

## 7. Broad questions ("summarise everything") only used one file

**Symptom**
Asking "give me an overview of this folder" returned an answer that referenced only one document, ignoring the other files entirely.

**Root cause**
Retrieval ranked chunks by cosine similarity and took the top 5. For a generic question like "summarise everything", the top chunks all came from whichever file had the most text or happened to embed closest to the query — the other files never appeared.

**Fix**
Add a spread strategy: if the top score is below 0.40 (broad/unfocused query), pick the single best chunk from each unique file instead of the global top-5. This ensures all files get representation.

```typescript
// src/lib/retrieval.ts
if (selectedChunks.length === 0 || topScore < 0.40) {
  const fileMap = new Map<string, RetrievedChunk>()
  for (const chunk of allChunks) {
    if (!fileMap.has(chunk.fileId)) fileMap.set(chunk.fileId, chunk)
  }
  selectedChunks = Array.from(fileMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_CONTEXT)
    .map((c) => ({ ...c, selected: true }))
}
```

---

## 8. Google access token expired mid-session, breaking re-index

**Symptom**
The app worked immediately after signing in, but re-indexing a folder an hour later returned `Invalid Credentials` errors from the Drive API.

**Root cause**
Google OAuth access tokens expire after ~1 hour. The app read `account.access_token` directly from the DB without checking expiry.

**Fix**
Create `src/lib/google-auth.ts` — a `getValidAccessToken(userId)` function that checks `expires_at` (with a 60-second buffer), and if expired, calls Google's token endpoint with the stored `refresh_token` to get a new access token, then persists it back to the DB. All Drive API calls now go through this function instead of reading the token directly.

---

## 9. Confidence always showed "Low"

**Symptom**
Even for answers with strong, well-cited evidence, the metadata badge always showed "Low confidence".

**Root cause**
Confidence thresholds were `high ≥ 0.85`, `medium ≥ 0.70` — thresholds appropriate for a model that returns scores near 1.0. With `text-embedding-3-small`, a score of 0.70 is exceptional. Normal good matches score 0.35–0.60, so everything fell into "low".

**Fix**
Recalibrate to match the model's actual score range.

```typescript
// src/lib/answer-generator.ts
const confidence = topScore >= 0.60 ? 'high'
  : topScore >= 0.45 ? 'medium'
  : 'low'
```

---

## 10. TiltCard 3D effect caused a compile error

**Symptom**
After adding the `TiltCard` component, the entire app failed to compile with:
```
Unexpected token `TiltCard`. Expected jsx identifier
```
The error was reported in `FolderCard.tsx` (which imports `TiltCard`), not in `TiltCard.tsx` itself.

**Root cause**
`useTransform` (a React hook from Framer Motion) was called inside a JSX `style` prop expression:
```tsx
// WRONG — hooks cannot be called inside JSX
<motion.div style={{ translateX: useTransform(x, ...) }}>
```
React's Rules of Hooks prohibit calling hooks anywhere other than the top level of a component. SWC (Next.js's compiler) emits a parse error when it detects this, which cascades into a confusing error in the importing file.

**Fix**
Move the `useTransform` calls to the component's top level.

```typescript
// src/components/ui/TiltCard.tsx
const innerX = useTransform(x, [-0.5, 0.5], [4, -4])
const innerY = useTransform(y, [-0.5, 0.5], [4, -4])

// then in JSX:
<motion.div style={{ translateX: innerX, translateY: innerY }}>
```

---

## 11. TypeScript error: onDelete prop type mismatch in Sidebar

**Symptom**
TypeScript reported:
```
Type '(folder: { id: string }) => void' is not assignable to type '() => void'
```
on the `onDelete` prop passed to `<Sidebar>` from `AppShell`.

**Root cause**
`Sidebar.tsx` declared `onDelete?: () => void` (no arguments), but the handler passed from `AppShell` took a `folder` argument — matching the signature `FolderCard` calls it with. The type chain was broken at the `Sidebar` interface.

**Fix**
Update `Sidebar`'s prop type to match the actual call signature.

```typescript
// src/components/layout/Sidebar.tsx
interface SidebarProps {
  onDelete?: (folder: IndexedFolder) => void  // was () => void
}
```

---

## 12. Integration test: testPrisma connecting to wrong database file

**Symptom**
All 28 integration tests failed immediately with:
```
PrismaClientKnownRequestError: The table `main.ChatMessage` does not exist
```
even though `prisma db push` had just run successfully.

**Root cause**
`testPrisma` was instantiated with a `datasources` override using an absolute path constructed via `path.resolve()`. Prisma's SQLite driver resolves the path differently when passed as a `datasources` override vs. when read from `DATABASE_URL`, resulting in the client connecting to a different (empty) file than the one `prisma db push` had populated.

**Fix**
Set `process.env.DATABASE_URL = 'file:./prisma/test.db'` before instantiating `testPrisma`, then create the client with no overrides. This matches how `prisma db push` resolves the path.

```typescript
// tests/integration/setup.ts
process.env.DATABASE_URL = 'file:./prisma/test.db'
export const testPrisma = new PrismaClient()  // reads from env, same as CLI
```

---

## 13. Integration test: wrong assumptions about chat() persistence model

**Symptom**
Three chat-persistence integration tests failed:
- "chat() persists both user and assistant messages" → got 1 message, expected 2
- "chat() loads prior messages as history" → got 5 messages, expected 6
- "chat() returns sessionId" → `sessionId: undefined` passed to Prisma create

**Root cause**
The tests called `service.chat()` directly, expecting it to save both the user and assistant messages. In reality, `chat()` only saves the assistant message — the user message is saved by the API route (`saveUserMessage`) before `chat()` is called. The tests also passed `undefined` as `sessionId` to `chat()`, which takes a non-optional `string`.

**Fix**
Mirror the actual call sequence in the API route: call `getOrCreateSession` → `saveUserMessage` → `chat()`.

```typescript
const sessionId = await service.getOrCreateSession(folderId, undefined)
await service.saveUserMessage(sessionId, 'Hello?')       // route does this
await service.chat(folderId, 'Hello?', sessionId, ...)   // then this
```

---

## 14. Integration test: wrong expectation for upsertFiles

**Symptom**
Test "upsertFiles does not create duplicate rows when the same driveFileId is seen again" failed — got 2 rows, expected 1.

**Root cause**
The test called `upsertFiles` with two different `id` values for the same `driveFileId`. But `upsertFiles` uses the Prisma `id` field as the upsert key (primary key), not `driveFileId`. Passing a new `id` is correctly treated as a new row — the deduplication-by-driveFileId responsibility belongs to `discoverAndSaveFiles`, which normalises IDs before calling `upsertFiles`. The test was asserting the wrong function's behaviour.

**Fix**
Rewrite the test to accurately describe what `upsertFiles` does: same `id` = update; then separately verify that `discoverAndSaveFiles` handles the driveFileId deduplication (which it does — that test already passes).

---

## 15. Summarization queries only returned one section of a document

**Symptom**
Asking "what is in this folder" or "summarize this pdf" for a single-file folder returned an answer covering only one section (e.g. Projects and Activities from a resume), completely missing Education, Skills, and Work Experience.

**Root cause**
Two compounding problems:

1. **Wrong retrieval strategy**: The broad-query spread logic was designed for *multi-file* folders — it picks the single best-scoring chunk per file. For a single-file folder, that means passing exactly 1 chunk to the LLM, discarding all other sections.

2. **Wrong system prompt**: `CITATION_SYSTEM_PROMPT` tells the model to "cite every claim" and "be concise", which causes it to list facts with footnotes rather than synthesise insights — even when all chunks are available.

**Fix**

Detect summarization intent from the query (`isSummarizationQuery`) and apply a different pipeline for those queries:

```typescript
// src/lib/retrieval.ts
if (isSummarize) {
  // Retrieve up to 20 candidates, then include ALL above the unsupported threshold (up to 10)
  // This passes every section of the document to the LLM, not just the top-scoring chunk
  selectedChunks = allChunks
    .filter((c) => c.score >= UNSUPPORTED_SCORE_THRESHOLD)
    .slice(0, 10)
    .map((c) => ({ ...c, selected: true }))
}
```

```typescript
// src/lib/answer-generator.ts
const SUMMARIZATION_SYSTEM_PROMPT = `...
Write a cohesive, insightful synthesis — NOT a flat list of facts.
Lead with a brief overview, organize by meaningful themes, highlight what is notable.
Write at the level of a smart colleague explaining the document to someone who hasn't read it.`

const systemPrompt = isSummarize ? SUMMARIZATION_SYSTEM_PROMPT : CITATION_SYSTEM_PROMPT
const maxTokens = isSummarize ? 1500 : 1000
```

---

---

## 16. `.pptx` parser called non-existent function

**Symptom**
PowerPoint files (.pptx) always failed during ingestion with `TypeError: parseOfficeAsync is not a function`.

**Root cause**
`officeparser` v6 renamed the function from `parseOfficeAsync` to `parseOffice` (already async). The call also changed: the new API returns an AST object with a `.toText()` method rather than a plain string.

**Fix**
```typescript
// src/lib/file-parsers/powerpoint.ts
const { parseOffice } = await import('officeparser')
const ast: any = await parseOffice(buffer)
const content: string = typeof ast.toText === 'function' ? ast.toText() : String(ast)
```

---

## 17. Legacy `.doc` / `.ppt` files parsed with wrong parser

**Symptom**
Files with `.doc` extension failed with `Could not find the body element: are you sure this is a docx file?`. `.ppt` files showed the same `parseOfficeAsync` error as above.

**Root cause**
Both `.doc` (binary BIFF8 Word) and `.ppt` (binary OLE2 PowerPoint) were routed to parsers that only understand the modern OOXML format (`.docx`/`.pptx`). `mammoth` only handles `.docx`; `officeparser` v6 only handles `.docx`, `.xlsx`, `.pptx`, `.odt`, `.pdf`, `.rtf`.

**Fix**
Split the MIME-type dispatch so legacy formats throw immediately with a clear, actionable error instead of a confusing library error:
```typescript
case 'application/msword':
  throw new Error('.doc is an old Word format... convert to .docx and re-index.')
case 'application/vnd.ms-powerpoint':
  throw new Error('.ppt is an old PowerPoint format... convert to .pptx and re-index.')
```

---

## 18. `setActiveFolderId is not a function` crash when adding a folder

**Symptom**
Adding a new folder threw `TypeError: setActiveFolderId is not a function`, and the sidebar never refreshed to show the new folder even though ingestion succeeded.

**Root cause**
`AddFolderModal` imported `setActiveFolderId` from the Zustand chat store, which was removed during the multi-tab refactor. The crash happened before `onFolderAdded()` was called, so the sidebar refresh callback never fired.

**Fix**
Replace `setActiveFolderId` with `addTab` (the new API) at all three call sites inside the modal.

---

## 19. Stale `.next` cache served old compiled modal after fix

**Symptom**
After fixing bug 18, the dev server still threw `ReferenceError: setActiveFolderId is not defined` even though the source file was correct.

**Root cause**
Next.js had already compiled and cached the broken version of `AddFolderModal`. The cache wasn't invalidated because the compilation error was in runtime code, not a type error detectable at build time.

**Fix**
Delete `.next/` and restart the dev server: `rm -rf .next && npm run dev`.

---

## 20. `messages is not iterable` crash on page load

**Symptom**
The app crashed immediately after the multi-tab refactor with `TypeError: messages is not iterable` in `SourceTabs.tsx`.

**Root cause**
`SourceTabs` destructured `messages` directly from `useChatStore()`. After the refactor, the store no longer exposes a flat `messages` array — messages live inside each tab object.

**Fix**
```typescript
// src/components/sources/SourceTabs.tsx
const { tabs, activeTabId } = useChatStore()
const activeTab = tabs.find((t) => t.id === activeTabId)
const messages = activeTab?.messages ?? []
```

---

## 21. Chat history lost on page refresh

**Symptom**
Refreshing the page cleared all chat tabs and messages. The DB had the sessions but the UI never loaded them.

**Root cause**
`ChatSession` had no `userId` field, so there was no way to query a user's sessions. The chat store was pure in-memory Zustand with no hydration from the DB on mount.

**Fix**
1. Added `userId String?` to `ChatSession` in the Prisma schema.
2. `getOrCreateSession` now accepts and stores `userId`.
3. New `GET /api/sessions` endpoint returns the user's 20 most recent sessions with all messages.
4. New `loadFromHistory` action in the chat store reconstructs tabs from DB sessions (no-op if tabs already open).
5. `AppShell` fetches `/api/sessions` once on sign-in and hydrates the store.

---

## 22. Summarization retrieved chunks from only one file

**Symptom**
"Give me an overview of everything in this folder" returned a detailed answer about one file and said nothing about the other 11 files in the folder.

**Root cause**
Summarization queries still used vector similarity search. The query "give me an overview of shaleen" happened to embed closest to `week 7 hyperdoc.docx`, so all 20 retrieved chunks came from that one file. The other files never appeared in the context.

**Fix**
For summarization queries, bypass similarity search entirely. Instead, query the DB directly for `chunkIndex = 0` of every indexed file in the folder — the opening chunk of each file, guaranteed one per file regardless of relevance score. This is added as `getFirstChunksPerFile()` on the `VectorStore` interface.

```typescript
// src/lib/vector-store.ts — new method
async getFirstChunksPerFile(folderIds: string[]): Promise<VectorMatch[]> {
  return prisma.textChunk.findMany({
    where: { folderId: { in: folderIds }, chunkIndex: 0 },
    ...
  })
}

// src/lib/retrieval.ts — summarization path
if (isSummarize) {
  const matches = await vectorStore.getFirstChunksPerFile(folderIds)
  // → one chunk per file, all files covered
}
```

---

## 23. Follow-up questions didn't resolve "that file" / "tell me more"

**Symptom**
After asking "what's in the M&M lab file?", asking "tell me more about it" retrieved random chunks instead of the M&M lab file, because "it" has no meaning to the embedding model.

**Root cause**
Retrieval is stateless — each question is embedded and searched independently. Pronouns and references like "that file", "it", "the document", "tell me more" embed to generic vectors with no connection to the prior conversation.

**Fix**
Query rewriting: before retrieval, if the query contains contextual references and there is conversation history, call `gpt-4o-mini` (cheap/fast) to rewrite the query into a self-contained form. "tell me more about it" → "tell me more about the M&M Equilibrium Lab document". Falls back silently to the original query if the rewrite call fails.

```typescript
// src/services/chat-service.ts
const effectiveQuery = await rewriteQueryIfNeeded(query, history)
const retrieval = await retrieve(effectiveQuery, folderIds)
```

---

## 24. Google Docs export returned raw JSON error string in tooltip

**Symptom**
Files that failed to export from Google Drive showed a raw JSON blob as their error message in the Files panel tooltip, e.g. `{"error":{"code":500,"message":"Internal Error",...}}`.

**Root cause**
`drive.files.export` threw an error whose `.message` property was a JSON string of the Google API error envelope. The ingestion service caught it and stored it verbatim as `errorMessage`.

**Fix**
Wrap the export in a try/catch that parses the JSON error, extracts `error.message`, and re-throws with a clean string. Also adds one automatic retry for transient 500/503 errors with a 2s delay.

---

---

## 25. Off-topic classifier misclassifying document questions as small talk

**Symptom**
"What are my chances with this investor pitch?" returned the generic "I'm focused on your documents" canned response instead of actually searching the documents.

**Root cause**
The `off_topic` examples in the classifier prompt were too broad. "What are my chances" superficially resembles casual phrasing, so gpt-4o-mini classified it as off_topic rather than targeted_fact.

**Fix**
Tightened the `off_topic` definition to *pure greetings only* (sup, hey, thanks, lol). Added explicit examples showing analytical/evaluative questions ("what are my chances", "how strong is this", "what would an investor think") map to `targeted_fact`. Added rule: "when in doubt, choose targeted_fact".

Also added rule 4 to `CITATION_SYSTEM_PROMPT`: give a direct assessment for evaluative questions rather than deflecting.

---

## 26. Follow-up questions generating the same answer as the previous turn

**Symptom**
"If they ask me about my future plans, what can I say?" generated an answer nearly identical to the previous "what are my chances" answer about the application folder.

**Root cause**
Two compounding issues:
1. The full previous assistant answer (800+ words) was included verbatim in conversation history passed to the LLM. The model anchored on it and reproduced similar content.
2. "what can I say" didn't match the CONTEXTUAL_RE regex, so query rewriting wasn't triggered. The query embedded similarly to the previous one, pulling the same document chunks.

**Fix**
1. Truncate assistant messages in history to 400 characters before passing to the LLM — enough for context, not enough to dominate the response.
2. Expanded CONTEXTUAL_RE to catch "what can I say", "what should I say", "they ask", "if asked", "how should I answer" patterns so these queries get rewritten into self-contained form before retrieval.

---

## 27. Inline bold (`**text**`) rendered as literal asterisks

**Symptom**
Answers showed `**Data-Driven Decision Making**: Implement advanced analytics…` with visible asterisks instead of bold text.

**Root cause**
The custom `AnswerContent` renderer split lines by `[N]` citation markers only. Inline `**bold**` patterns were passed through as plain strings with no transformation.

**Fix**
Updated `parseWithCitations` to split on both `\*\*[^*]+\*\*` and `\[\d+\]` in one regex pass. Bold segments are wrapped in `<strong className="font-semibold text-zinc-100">`. The standalone full-line bold check was updated to use a proper regex (`/^\*\*[^*]+\*\*$/`) instead of the fragile `startsWith`/`endsWith` check.

---

## 28. Vercel build failed: stale Prisma client

**Symptom**
Build failed with `PrismaClientInitializationError: Prisma has detected that this project was built on Vercel, which caches dependencies. This leads to an outdated Prisma Client because Prisma's auto-generation isn't triggered.`

**Root cause**
Vercel caches `node_modules` between builds. The `postinstall` hook that normally runs `prisma generate` is skipped when the cache is used. The compiled Prisma client was stale and didn't match the current schema.

**Fix**
Prepend `prisma generate` to the build script in `package.json`:
```json
"build": "prisma generate && next build"
```

---

## 29. Ingestion progress not visible during indexing in production

**Symptom**
The progress bar didn't update during indexing on Vercel. Status polling always returned the fallback (DB folder row) rather than live per-file progress.

**Root cause**
Progress was stored in a `Map` in-memory (`progressMap`). On Vercel, each polling request hits a different serverless Lambda instance with no shared memory — the `Map` on the instance running ingestion is invisible to the instance serving `/status`.

**Fix**
Replaced in-memory `progressMap` with a `progressJson String?` column on `IndexedFolder`. `setProgress` writes JSON to this column; `getIngestionProgress` reads it. Both the ingestion and polling functions hit the same Postgres DB, so progress is visible across instances.

---

## 30. `setProgress` DB writes blocking ingestion past Vercel's 30s timeout

**Symptom**
Ingestion of a 5-file folder got stuck on `ingesting` in production. Files were being indexed but `updateFolderStatus('indexed')` never ran.

**Root cause**
Each `await setProgress(...)` call made a DB write to Neon. When Neon is waking from autosuspend, each write adds 1–3s of latency. With one `setProgress` call per file plus several others, the total wait on progress writes alone pushed the ingestion past Vercel Hobby's 30s function timeout. The function was killed before reaching `updateFolderStatus('indexed')`.

**Fix**
Made `setProgress` fire-and-forget (removed `await`). Progress writes are informational — they should never block the ingestion pipeline. The critical status writes (`updateFolderStatus`) remain awaited.

```typescript
function setProgress(update: IngestionProgress): void {
  prisma.indexedFolder.update({ ... }).catch(() => {})  // no await
}
```

---

## 31. Vercel Lambda frozen after 202 response, ingestion never completing

**Symptom**
Even after removing the blocking `setProgress` awaits, reindexing still occasionally got stuck. The ingestion function was being killed mid-way through.

**Root cause**
Vercel serverless (AWS Lambda) can freeze or terminate the execution context after a response is sent. The fire-and-forget `ingestFolder().catch()` pattern relied on the Lambda staying alive, which is non-deterministic.

**Fix**
Used `waitUntil()` from `@vercel/functions`. This explicitly registers the background promise with the Vercel runtime, guaranteeing it runs to completion (up to `maxDuration`) even after the 202 response is sent.

```typescript
import { waitUntil } from '@vercel/functions'
waitUntil(ingestFolder(folder, accessToken).catch(console.error))
return NextResponse.json({ message: 'Ingestion started' }, { status: 202 })
```

---

## 32. Double ingest call resetting folder status to `ingesting`

**Symptom**
After a successful reindex, the folder status reverted to `ingesting`. DB showed `fileCount: 5`, `lastIndexed` set (completion ran), but `status: 'ingesting'`.

**Root cause**
A second call to `POST /api/folders/[id]/ingest` was received while the first ingestion was completing. The second call immediately set `status = 'ingesting'` via `updateFolderStatus`, overwriting the `indexed` state set by the first.

**Fix**
Added a guard in the ingest route: if `folder.status === 'ingesting'`, return 202 immediately without starting a new pipeline.

```typescript
if (folder.status === 'ingesting') {
  return NextResponse.json({ message: 'Already ingesting' }, { status: 202 })
}
```

---

## 33. Stale `progressJson` caused polling to stop before new reindex completed

**Symptom**
After reindexing, the folder status pill showed `ingesting` even after the index completed. Refreshing the page showed the same.

Separately: the file count on the folder card showed the old count (5) instead of the new count (6) after a file was added and the folder was reindexed.

**Root cause**
`progressJson` was only cleared on terminal states (`indexed`, `error`). When a new reindex started:
1. `updateFolderStatus('ingesting')` ran — set `status = 'ingesting'`, left `progressJson` intact
2. `progressJson` still contained `{"status":"indexed",...}` from the previous run
3. The status polling read `progressJson`, saw `status: 'indexed'`, assumed indexing was done, and called `onReindex()` immediately — before the new ingestion had run
4. `refetchFolders()` ran and showed the old `fileCount`

**Fix**
Clear `progressJson` on ALL status changes, not just terminal ones:

```typescript
// src/services/folder-service.ts
const clearProgress = true  // clear on every status change
```

This ensures the status route always falls back to the authoritative `IndexedFolder.status` and `fileCount` fields rather than stale cached JSON.

---

## 34. Neon autosuspend causing PostgreSQL connection errors

**Symptom**
Vercel logs showed repeated `Error in PostgreSQL connection: FATAL: terminating connection due to administrator command` (SQL state E57P01).

**Root cause**
Neon free tier suspends the compute after 5 minutes of inactivity. When Prisma held open persistent TCP connections and Neon suspended, those connections were forcibly terminated. New requests then failed until the connection was re-established.

**Fix**
Switch from the direct Neon connection string to the **pooled** connection string (pgBouncer). The pooled URL has `-pooler` in the hostname. pgBouncer manages connection lifecycle and handles the suspend/wake cycle gracefully. Serverless functions should always use pooled connections with Neon.

---

## 35. Off-topic responses always identical regardless of message

**Symptom**
"thanks", "bye", "hey", and any other off-topic message all received the exact same response: "I'm focused on your documents — ask me anything about what's in your folder…"

**Root cause**
Off-topic was handled with a hardcoded string rather than a language model call.

**Fix**
Replaced the static string with a short `gpt-4o-mini` call using a system prompt that instructs the model to reply naturally: acknowledge thanks warmly, say hello back to greetings, give a proper farewell to "bye", and only redirect to document features when the message has no clear conversational response. `max_tokens: 80` keeps it brief and cheap.

---

## 36. 429 token limit error on large PDFs for specific questions

**Symptom**
Asking "what does question 35 ask" on a 32-page exam PDF returned a 429 error: "30,819 tokens requested, limit 30,000".

**Root cause**
The intent classifier routed "what does question 35 ask" to `single_file_deep`, which fetched ALL chunks for the file (~68 chunks × ~450 tokens = ~30k tokens) — far exceeding OpenAI's TPM limit. The classifier was treating any question that mentioned a specific item in a named file as a deep-dive request.

**Fix**
Two changes:
1. Tightened the classifier prompt: `single_file_deep` now only triggers for full-file overview requests ("explain everything in…", "walk me through…"). Any specific fact/detail — even from a named file — routes to `targeted_fact` instead. Added explicit "when in doubt, targeted_fact" rule.
2. Replaced `getAllChunksForFile()` with `vectorStore.queryFile(queryEmbedding, fileId, MAX_SINGLE_FILE_CHUNKS)` in `retrieveSingleFile`. Caps at 15 chunks by cosine similarity to the query, then re-sorts by chunk index for document order. Keeps context under ~7k tokens.

```typescript
// src/lib/retrieval.ts
const MAX_SINGLE_FILE_CHUNKS = 15
const topMatches = await vectorStore.queryFile(queryEmbedding, fileId, MAX_SINGLE_FILE_CHUNKS)
const matches = [...topMatches].sort((a, b) => (a.metadata.chunkIndex ?? 0) - (b.metadata.chunkIndex ?? 0))
```

---

## 37. Query rewriter overriding explicit identifiers with history context

**Symptom**
After asking about question 25, asking "what about question 35" returned the answer for question 25 instead of 35.

**Root cause**
The query rewriter received the full conversation history (which mentioned question 25 heavily) and rewrote "what about question 35" incorporating that context — producing something like "what about question 25 in the HS Business Administration exam" — overriding the explicit "35" the user stated.

**Fix**
Added CRITICAL RULES to the rewriter system prompt: explicit numbers, names, and identifiers stated by the user must always be preserved exactly. Context from history should only fill in what is *missing* from the user's message, never override what they said.

```
CRITICAL RULES:
- If the user explicitly states a number, name, or identifier (e.g. "question 35"),
  ALWAYS preserve it exactly — never replace it with a number from conversation history.
- Only pull context from history to fill in what is MISSING from the user's message.
```

---

## 38. Keyword search newline pattern didn't match PDF chunk text

**Symptom**
Even after adding keyword search for numbered items, "what is question 35" still returned "not in the provided excerpt". The model correctly admitted it couldn't find Q35 (bug 37 fix working) but retrieval still missed the chunk.

**Root cause**
PDF chunks are stored as a single blob of text with spaces between questions: `"...D. new products 35. Which of the following..."`. The keyword search patterns `\n35.` and `\n35 ` never matched because there are no newlines between questions in PDF-extracted text.

**Fix**
Changed patterns to match the actual PDF format — space-prefixed number followed by period and space:
```typescript
OR: [
  { text: { contains: ` ${num}. ` } },   // " 35. " — matches mid-blob PDF format
  { text: { contains: `\n${num}. ` } },   // newline before (structured docs)
  { text: { startsWith: `${num}. ` } },   // starts with "35. " (first chunk)
]
```

---

## 39. Sources dropdown causing horizontal overflow in chat panel

**Symptom**
When expanding the "N sources" toggle under an assistant message, the right chat panel grew wider and caused horizontal overflow. Closing sources fixed it.

**Root cause**
The expanded source card contained long unbroken exam question text (e.g. `"24. Which of the following is NOT a capital resource: A. Warehouse B. Manufacturing plant C. Assembly line..."`). This text had no natural word-break points and no overflow constraint, pushing the container wider than the panel.

**Fix**
Added `overflow-x-hidden` to the sources list container in `AssistantAnswer.tsx` and `break-words overflow-hidden` to the chunk text paragraph in `SourceCard.tsx`.

---

## 40. Drag handles stayed attached to cursor after mouse release

**Symptom**
After dragging a panel divider and releasing the mouse, the panel continued resizing as the cursor moved. Moving the cursor left or right kept adjusting the panel width even without holding the button.

**Root cause**
Event listeners were created inside `useCallback` closures on `handleLeftDragStart` / `handleRightDragStart`. Each call to these functions added new `mousemove` and `mouseup` listeners to `window`. If `leftPanelWidth` changed (which happens on every mousemove), React re-created the callback, and a second mousedown would add a second set of listeners referencing different closure instances. The `removeEventListener` call only removed the latest listener — older stacked listeners kept firing.

**Fix**
Moved all `window` event listeners into a single `useEffect` (added once, cleaned up on unmount). Drag start state is stored in `useRef` so the persistent handlers always read current values without stale closures:

```typescript
const leftDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

useEffect(() => {
  const onMouseMove = (e: MouseEvent) => {
    if (leftDragRef.current) { /* update width from ref */ }
  }
  const onMouseUp = () => {
    if (leftDragRef.current) { leftDragRef.current = null; setIsDraggingLeft(false) }
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  return () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
}, [setLeftPanelWidth, setRightPanelWidth])
```

---

## 41. DOCX/Google Docs viewer showing invisible text and broken formatting

**Symptom**
DOCX files rendered in the document viewer had light/invisible text against the white paper background, broken tables, and incorrect indentation. Some documents were entirely unreadable.

**Root cause**
mammoth's HTML conversion strips or misinterprets Word's internal styles. Inline color styles from Word (e.g. white text on a dark shape) are preserved as `color: #ffffff` but render against the white paper background making text invisible. Table borders, column widths, and indentation levels from Word's XML are either dropped or approximated incorrectly.

**Fix**
Replaced mammoth → HTML rendering entirely for the viewer with a Google Drive iframe:
```
https://drive.google.com/file/d/{driveFileId}/preview
```
Google's own renderer handles all colors, tables, fonts, and indentation correctly. The iframe uses the user's existing Google browser session (they're always logged in via OAuth). mammoth is still used in the ingestion pipeline for text extraction — only the viewer changed.

Also extended iframe rendering to Google Sheets, Google Slides, PPTX, XLS, and legacy .doc formats — all now preview via Google's renderer rather than server-side conversion.

---

## Summary

| # | Area | Type | Impact |
|---|------|------|--------|
| 1 | Ingestion | Data integrity bug | Silent data corruption (duplicate rows) |
| 2 | UI | Logic bug | Feature entirely hidden |
| 3 | UI | Missing polling | Broken loading state |
| 4 | Retrieval | Wrong constant | Core RAG feature non-functional |
| 5 | State management | Missing API | Stale UI after user action |
| 6 | Chat | Missing wiring | Conversation memory completely broken |
| 7 | Retrieval | Algorithm gap | Poor results on common query type |
| 8 | Auth | Missing token refresh | App breaks after 1 hour in production |
| 9 | Retrieval | Wrong constant (model mismatch) | Misleading confidence metadata |
| 10 | React | Rules of Hooks violation | App fails to compile |
| 11 | TypeScript | Type definition | Compile-time error, incorrect prop contract |
| 12 | Testing | DB path resolution | All integration tests failed to start |
| 13 | Testing | Incorrect call sequence assumption | Tests validated wrong code path |
| 14 | Testing | Wrong function under test | Test expected behaviour of a different layer |
| 15 | Retrieval + Prompt | Wrong strategy for summarization | Answers showed 1 section, missed rest of document |
| 16 | File parsing | Wrong API version | All .pptx files failed to parse |
| 17 | File parsing | Wrong parser for format | Misleading error on .doc/.ppt files |
| 18 | UI / Store | Stale import after refactor | Crash on adding a folder, sidebar never refreshed |
| 19 | Build | Stale .next cache | Fix not applied despite correct source |
| 20 | UI / Store | Stale destructure after refactor | App crashed immediately on load |
| 21 | Persistence | Missing userId + no hydration | Chat history wiped on every page refresh |
| 22 | Retrieval | Similarity bias in summarization | 11 of 12 files invisible to overview queries |
| 23 | Retrieval | Stateless embeddings | Follow-up questions ignored prior context |
| 24 | File parsing | Raw JSON error surfaced to user | Unreadable error messages in Files panel |
| 25 | Retrieval / Intent | Classifier too aggressive | Document questions treated as small talk |
| 26 | Chat | History pollution + missing rewrite | Follow-up generated same answer as prior turn |
| 27 | UI | Missing markdown renderer | Bold text shown as literal asterisks |
| 28 | Build / Deployment | Stale Prisma client on Vercel | Production build failed |
| 29 | Deployment | In-memory progress not shared | Progress bar never updated in production |
| 30 | Deployment | Blocking progress writes | Ingestion killed by 30s timeout before completion |
| 31 | Deployment | Lambda frozen after response | Ingestion randomly failed to complete |
| 32 | Deployment | Double ingest call | Status reset to ingesting after successful completion |
| 33 | Deployment | Stale progressJson not cleared | Polling stopped early, file count showed wrong number |
| 34 | Deployment | Neon autosuspend killing connections | PostgreSQL connection errors in production |
| 35 | UI / LLM | Static off-topic response | All small talk got identical robotic reply |
| 36 | Retrieval | Token limit exceeded on large PDFs | 429 error on specific questions about large files |
| 37 | Retrieval / Query rewriter | Rewriter overriding explicit identifiers | Follow-up "question 35" answered with question 25 content |
| 38 | Retrieval | Keyword search newline pattern didn't match PDF chunks | Specific numbered questions not found even with keyword search |
| 39 | UI / Layout | Sources dropdown causing horizontal overflow | Right panel pushed wider when sources expanded |
| 40 | UI / Layout | Drag handles stayed attached to cursor after mouseup | Panels continued moving after releasing mouse |
| 41 | Viewer | DOCX/Google Docs rendering colors/tables incorrectly | Invisible text, broken tables, wrong indentation in document viewer |
