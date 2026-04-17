# Talk to a Folder — Presentation Notes

Quick-read notes on what was built, what broke, how it was fixed, and where it's going.

---

## What the app does

Google Drive folder → index → chat with citations.

1. Paste a Drive folder link
2. App crawls all files (subfolders included, up to 5 levels deep)
3. Files are parsed, split into chunks, embedded with OpenAI, stored in SQLite
4. Ask a question → retrieve relevant chunks → GPT-4o generates a grounded answer with inline citations [1][2][3]
5. Hover a citation → source card highlights. Click → see exact text used.

---

## Architecture

```
Ingest:  Drive API → parse file → chunk text → embed → SQLite

Query:   question → (rewrite if vague) → embed → retrieve chunks → GPT-4o → stream answer
```

**State**: Zustand. Each folder combination gets its own tab with its own session and message history.

**Streaming**: SSE. Tokens stream in real time. Citations and metadata arrive at end of stream.

---

## Retrieval approaches tried (evolution)

### V1 — Plain cosine similarity
Embed query → find top-8 most similar chunks → send top-5 to GPT-4o.

**Problem**: Works well for specific questions. Fails for broad questions ("what's in this folder") — similarity search clusters around one or two files and ignores the rest.

### V2 — Spread strategy
If top similarity score < 0.40, take the best chunk from each unique file instead.

**Problem**: Still cosine-based. "Summarize" queries don't necessarily score low — they just score evenly across files, so the spread heuristic doesn't always trigger.

### V3 — Summarization bypass (current)
Detect summarization-pattern queries → skip cosine search entirely → fetch `chunkIndex=0` from every file in the DB → send all to GPT-4o.

**Problem**: `chunkIndex=0` is only the first 1800 chars of each file. Long files are under-represented.

### V4 — Proposed: two-level index + intent router
At index time: generate a per-file LLM summary (stored in DB alongside chunks).
At query time: classify intent → route to the right strategy:
- Broad/summary → send file summaries (all files, full picture)
- Specific file → fetch all chunks for that file (full depth)
- Targeted fact → cosine similarity over chunks (current behavior)

This is the system that handles "broad picture + deep dive" intelligently without keyword tricks.

---

## Query rewriting

**Problem**: Follow-up questions like "tell me more about that file" fail retrieval because "that file" has no embedding match.

**Fix**: Before retrieval, run the query through `gpt-4o-mini` with recent conversation history. Resolves pronouns and vague references into a self-contained question. Gated by a regex check to avoid unnecessary API calls. Silent fallback on failure.

---

## Multi-folder support

- Each chat tab holds multiple `folderIds`
- Retrieval queries all folders simultaneously
- Two-pass balanced selection: minimum chunks guaranteed per folder, then global fill
- Each chunk labeled `[Folder: Name]` in LLM context
- Separate `CROSS_FOLDER_SYSTEM_PROMPT` for comparison questions

---

## Bugs fixed (highlights)

| Bug | Root cause | Fix |
|-----|-----------|-----|
| `.pptx` parse crash | `officeparser` v6 renamed API | Updated call + `.toText()` on AST |
| `.doc`/`.ppt` silent failure | OLE2 binary fed to wrong parser | Throw early with conversion instructions |
| Summarization showing 1 of 12 files | Cosine similarity biased to one file | `getFirstChunksPerFile` bypass |
| Follow-up questions ("that file") failing | Vague reference not retrievable | `gpt-4o-mini` query rewriting |
| Source dots hidden by scrollbar | Fixed panel width, no resize | Drag-to-resize panel divider |
| History lost on page reload | Not persisted | `/api/sessions` + `loadFromHistory` on auth |
| Google Drive 500 errors | Transient export API failures | 1 retry after 2s |

---

## File types

**Supported:**
- Google Docs, Google Sheets
- PDF
- Word (.docx), Excel (.xlsx), PowerPoint (.pptx)
- Plain text, Markdown, CSV

**Ignored (not crawled):**
- Images (PNG, JPG, GIF, etc.)
- Video/audio files
- Google Forms, Google Slides (not in supported list)
- ZIP/archive files
- Any MIME type not in the supported list — Drive API filters these out before they reach the app

**Parsed but skipped:**
- `.doc` / `.ppt` (legacy OLE2 binary) — crawled, flagged with error message, not indexed
- Files with no extractable text (image-only PDFs, scanned docs) — marked `skipped` with reason shown in Files panel

---

## Pricing (estimated, OpenAI)

**At index time (one-time per file):**
- Embedding: `text-embedding-3-small` — ~$0.00002/1K tokens. A 5-page doc ≈ 1,500 tokens ≈ $0.00003.
- With proposed summaries: +1 `gpt-4o-mini` call per file ≈ $0.0002–0.001 per file.
- 12-file folder: ~$0.01–0.02 total to index.

**At query time (every question):**
- Query embedding: < $0.0001
- Optional rewrite (`gpt-4o-mini`): ~$0.0002
- Answer generation (`gpt-4o`): ~$0.01–0.03 per question depending on context size

**Rough estimate**: indexing a folder costs pennies. Chatting costs ~$0.01–0.05 per question.

**With two-level index**: summary queries become cheaper (small summaries in context vs. many chunks). Specific-file queries become more expensive (all chunks for one file). Net effect is roughly neutral.

---

## What the keyword filter does and doesn't catch

Current summarization keywords: `summarize`, `summarise`, `summary`, `overview`, `what is in`, `what's in`, `whats in`, `about this`, `tell me about`, `describe`, `what does this`, `give me an overview`, etc.

**`describe` is on the list** — it routes to summarization.

Words NOT on the list (e.g. "explain", "analyze", "break down", "walk me through", "review"):
- Do NOT fail — they fall through to cosine similarity search (the targeted-fact path)
- The answer quality depends on whether the relevant chunks score high enough
- For broad questions phrased with unlisted words, the model may only see a few chunks and miss the full picture

The proposed intent classifier (V4) fixes this — instead of matching keywords, a cheap LLM call determines intent, so any phrasing of a broad question routes correctly.

---

## Can you ask for improvements on files?

Not currently. The app is read-only — it can analyze and answer questions about document content, but cannot write back to Google Drive or suggest edits inline. This would require `drive` write scope (currently only `drive.readonly`) and a generation mode focused on producing revised text rather than citations.

---

## Presentation strategy

**Best approach: show the before/after arc**

1. **Problem statement** — "I want to talk to my Google Drive folder"
2. **V1 demo** — basic Q&A with citations, show a specific question working
3. **Failure point** — show broad question returning only 4 of 12 files
4. **Fix** — show same question after `getFirstChunksPerFile`, all 12 files mentioned
5. **Another failure** — follow-up question ("what about Interview uncle.docx") failing
6. **Fix** — query rewriting, show it resolving the reference
7. **Multi-folder demo** — two folders open in one tab, comparison question
8. **Architecture slide** — the two-level index proposal as "where this goes next"

**Screenshots to take:**
- Folder card with staleness badge (amber warning icon)
- Files panel showing error tooltip on a skipped file
- Side-by-side: old summarization (4 files) vs new (all files)
- Citation hover highlighting source card
- Debug tab showing cosine scores
- Multi-folder tab with labeled sources [Folder: shaleen]
- Drag-to-resize panel in action

---

## Key numbers for the slide

- Context window used per query: ~5–12 chunks × 1800 chars ≈ 2,000–4,000 tokens
- Embedding dimension: 1536
- Max files per folder: 200
- Max file size: 20 MB
- Rate limit: 20 questions/user/60 seconds
- History loaded: last 6 messages per session
