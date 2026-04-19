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
