import OpenAI from 'openai'
import { prisma } from './prisma'
import { embeddings } from './embeddings'
import { vectorStore } from './vector-store'
import {
  TOP_K_RETRIEVAL,
  TOP_K_CONTEXT,
  MIN_RELEVANCE_SCORE,
  UNSUPPORTED_SCORE_THRESHOLD,
} from '@/constants'
import type { RetrievedChunk, RetrievalDebugInfo } from '@/types'

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

export type QueryIntent =
  | 'broad_summary'        // overview of the whole folder or all files
  | 'single_file_deep'     // deep dive on one specifically named file
  | 'cross_folder_compare' // compare content across multiple folders
  | 'targeted_fact'        // specific fact / detail retrieval (cosine similarity)
  | 'off_topic'            // greetings, small talk, or anything not about documents

interface ClassifiedIntent {
  intent: QueryIntent
  targetFileName?: string  // populated when intent is single_file_deep
}

// ---------------------------------------------------------------------------
// Intent classifier — one cheap gpt-4o-mini call per query
// Falls back to targeted_fact on any error
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Query rewriter — expands ambiguous follow-ups into self-contained queries
// Only rewrites when the query looks like a follow-up (short or pronoun-heavy)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Query rewriter — turns every user message into a self-contained search query.
//
// Problem: vector search works by embedding the query and finding similar chunks.
// A follow-up like "whats the correct answer" or "can you explain why that's right"
// embeds poorly — the vector has no idea what "that" or "correct answer" refers to.
// Result: wrong chunks are retrieved, and the answer is wrong or says "not found".
//
// Fix: before embedding, send the last few conversation turns + the user's message
// to gpt-4o-mini and ask it to rewrite into one fully self-contained query.
// "whats the correct answer" → "what is the correct answer for question 35 in the
// HS Business Administration Core Sample Exam"
//
// If the query is already self-contained the LLM returns it unchanged, so this is
// always safe to run. Runs in parallel with intent classification so it adds no
// latency to the critical path.
// ---------------------------------------------------------------------------

async function rewriteQuery(
  query: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  if (history.length === 0) return query

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const recentHistory = history.slice(-4)
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a search query rewriter for a document assistant. Given a conversation history and the user's latest message, rewrite the message into a single fully self-contained search query that includes all necessary context (file names, topics, specific items mentioned earlier).

CRITICAL RULES:
- If the user explicitly states a number, name, or identifier (e.g. "question 35", "section 3", "page 10"), ALWAYS preserve it exactly — never replace it with a number or name from the conversation history.
- Only pull context from history to fill in what is MISSING from the user's message, not to override what they said.
- If the message is already self-contained, return it unchanged.

Output ONLY the rewritten query — no explanation, no quotes.`,
        },
        ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 80,
    })
    const rewritten = res.choices[0]?.message?.content?.trim()
    return rewritten && rewritten.length > 0 ? rewritten : query
  } catch {
    return query
  }
}

async function classifyIntent(
  query: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  isMultiFolder: boolean,
): Promise<ClassifiedIntent> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify the user's question into exactly one intent. The user is talking to a document assistant about files in their Google Drive folder.

Intents:
- broad_summary: wants an overview of the whole folder or all files (e.g. "what's in this folder", "summarize everything", "describe all files", "analyze the documents", "walk me through", "give me an overview", "explain what's here", "what do I have")
- single_file_deep: wants a full, comprehensive explanation of one specific named file — NOT a specific fact from it (e.g. "summarize the Q3 report", "explain everything in the resume file", "walk me through the M&M lab doc", "what is the whole contract about"). Only use this when the user wants broad coverage of the entire file, not a specific detail.
- cross_folder_compare: wants to compare content across multiple folders (e.g. "compare these folders", "how do they differ", "what's different between them", "similarities between folders")
- targeted_fact: any specific question about content, facts, or details in the documents — including questions about a specific item within a named file (e.g. "what were the revenue projections", "who wrote the memo", "what does question 35 ask", "what is question 50 about", "what does section 3 say", "what are the risks", "what are my chances", "how strong is this proposal"). Use this whenever the user wants a specific piece of information, even if they mention a file name.
- off_topic: ONLY for pure small talk or greetings with zero relation to documents or their content (e.g. "sup", "hey", "thanks", "how are you", "lol", "ok", "cool", "what's 2+2"). If there is ANY chance the question relates to the documents or their subject matter, do NOT classify as off_topic — use targeted_fact instead.

IMPORTANT: When in doubt between targeted_fact and off_topic, always choose targeted_fact.
IMPORTANT: When in doubt between single_file_deep and targeted_fact, always choose targeted_fact. single_file_deep is only for "explain the whole file" requests.

Respond with JSON only: {"intent": "<intent>", "targetFileName": "<extracted file name or key phrase if single_file_deep, otherwise null>"}`,
        },
        ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    const intent = parsed.intent as QueryIntent

    if (!['broad_summary', 'single_file_deep', 'targeted_fact', 'cross_folder_compare', 'off_topic'].includes(intent)) {
      return { intent: 'targeted_fact' }
    }

    // cross_folder_compare only makes sense with multiple folders
    if (intent === 'cross_folder_compare' && !isMultiFolder) {
      return { intent: 'broad_summary' }
    }

    return {
      intent,
      targetFileName: parsed.targetFileName ?? undefined,
    }
  } catch {
    return { intent: 'targeted_fact' }
  }
}

// ---------------------------------------------------------------------------
// File name lookup — used for single_file_deep
// Tries exact match first, then partial/fuzzy match
// ---------------------------------------------------------------------------

// Normalize a file name or search term for fuzzy comparison:
// strips extension, lowercases, replaces underscores/hyphens/dots with spaces
function normalizeFileName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[^.]+$/, '')   // strip extension
    .replace(/[_\-.]/g, ' ')  // underscores, hyphens, dots → spaces
    .replace(/\s+/g, ' ')     // collapse whitespace
    .trim()
}

async function findFileByName(
  name: string,
  folderIds: string[],
): Promise<string | null> {
  const files = await prisma.driveFile.findMany({
    where: { folderId: { in: folderIds }, status: 'indexed' },
    select: { id: true, name: true },
  })

  const normQuery = normalizeFileName(name)

  // Exact normalized match
  const exact = files.find((f) => normalizeFileName(f.name) === normQuery)
  if (exact) return exact.id

  // Partial normalized match: file name contains query or query contains file name stem
  const partial = files.find((f) => {
    const normFile = normalizeFileName(f.name)
    return normFile.includes(normQuery) || normQuery.includes(normFile)
  })
  return partial?.id ?? null
}

// ---------------------------------------------------------------------------
// File representations for broad summary / cross-folder compare
// Uses stored summary where available; falls back to chunk 0 otherwise
// ---------------------------------------------------------------------------

async function getFileRepresentations(folderIds: string[]): Promise<RetrievedChunk[]> {
  const files = await prisma.driveFile.findMany({
    where: { folderId: { in: folderIds }, status: 'indexed' },
    select: { id: true, name: true, folderId: true, summary: true },
  })

  const filesWithoutSummary = files.filter((f) => !f.summary)

  // Batch-fetch chunk 0 for files that haven't been summarized yet
  const fallbackChunks =
    filesWithoutSummary.length > 0
      ? await prisma.textChunk.findMany({
          where: {
            fileId: { in: filesWithoutSummary.map((f) => f.id) },
            chunkIndex: 0,
          },
          select: { id: true, fileId: true, text: true },
        })
      : []

  const chunkMap = new Map(fallbackChunks.map((c) => [c.fileId, c]))

  return files
    .map((file, i) => {
      const text = file.summary ?? chunkMap.get(file.id)?.text ?? ''
      const chunkId = file.summary
        ? `summary-${file.id}`
        : (chunkMap.get(file.id)?.id ?? `fallback-${file.id}`)

      return {
        chunkId,
        fileId: file.id,
        fileName: file.name,
        folderId: file.folderId,
        text,
        score: 1.0,
        rank: i + 1,
        selected: true,
      }
    })
    .filter((c) => c.text.length > 0)
}

// ---------------------------------------------------------------------------
// RetrievalResult
// ---------------------------------------------------------------------------

export interface RetrievalResult {
  selectedChunks: RetrievedChunk[]
  debugInfo: RetrievalDebugInfo
  isSupported: boolean
  folderIds: string[]
  intent: QueryIntent
  // Set when the system made a non-obvious decision the user should be aware of.
  // The answer generator uses this to prepend a brief assumption statement.
  assumption?: string
}

// ---------------------------------------------------------------------------
// Main retrieve function
// ---------------------------------------------------------------------------

export async function retrieve(
  query: string,
  folderIds: string[],
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  sourceFileId?: string,
): Promise<RetrievalResult> {
  const startMs = Date.now()
  const isMultiFolder = folderIds.length > 1

  // If the user sent a quoted selection from a specific file, skip intent classification
  // and pin retrieval to that file. This prevents the model from answering about a
  // different document than the one the user is looking at.
  if (sourceFileId) {
    return retrieveSingleFile(query, sourceFileId, folderIds, startMs, undefined, true)
  }

  // Rewrite follow-up queries and classify intent in parallel
  const [rewrittenQuery, { intent, targetFileName }] = await Promise.all([
    rewriteQuery(query, history),
    classifyIntent(query, history, isMultiFolder),
  ])
  const effectiveQuery = rewrittenQuery

  // Off-topic: skip retrieval entirely
  if (intent === 'off_topic') {
    return {
      selectedChunks: [],
      debugInfo: {
        query,
        intent,
        retrievedChunks: [],
        selectedChunkIds: [],
        totalRetrieved: 0,
        totalSelected: 0,
        retrievalLatencyMs: Date.now() - startMs,
        generationLatencyMs: 0,
        totalLatencyMs: 0,
      },
      isSupported: false,
      folderIds,
      intent,
    }
  }

  // Route to the correct retrieval strategy
  if (intent === 'broad_summary' || intent === 'cross_folder_compare') {
    return retrieveBroadSummary(effectiveQuery, folderIds, intent, startMs)
  }

  if (intent === 'single_file_deep') {
    const fileId = targetFileName ? await findFileByName(targetFileName, folderIds) : null
    if (fileId) {
      return retrieveSingleFile(effectiveQuery, fileId, folderIds, startMs, targetFileName)
    }
    // File not found by name — fall back to cosine similarity with an assumption note
    const fallback = await retrieveTargetedFact(effectiveQuery, folderIds, isMultiFolder, startMs, 'targeted_fact')
    if (targetFileName) {
      fallback.assumption = `Couldn't find a file matching "${targetFileName}" — searching across all documents instead. Try using the exact file name if you meant a specific file.`
    }
    return fallback
  }

  // targeted_fact (or single_file_deep fallback)
  return retrieveTargetedFact(effectiveQuery, folderIds, isMultiFolder, startMs, intent)
}

// ---------------------------------------------------------------------------
// broad_summary / cross_folder_compare: per-file summaries or chunk-0 fallback
// ---------------------------------------------------------------------------

async function retrieveBroadSummary(
  query: string,
  folderIds: string[],
  intent: QueryIntent,
  startMs: number,
): Promise<RetrievalResult> {
  const selectedChunks = await getFileRepresentations(folderIds)
  const retrievalLatencyMs = Date.now() - startMs

  const debugInfo: RetrievalDebugInfo = {
    query,
    intent,
    retrievedChunks: selectedChunks,
    selectedChunkIds: selectedChunks.map((c) => c.chunkId),
    totalRetrieved: selectedChunks.length,
    totalSelected: selectedChunks.length,
    retrievalLatencyMs,
    generationLatencyMs: 0,
    totalLatencyMs: 0,
  }

  return {
    selectedChunks,
    debugInfo,
    isSupported: selectedChunks.length > 0,
    folderIds,
    intent,
  }
}

// ---------------------------------------------------------------------------
// single_file_deep: all chunks for one specific file
// ---------------------------------------------------------------------------

// Max chunks to pass for a single-file deep dive.
// At ~450 tokens/chunk this keeps the context under ~7k tokens, well within any tier limit.
const MAX_SINGLE_FILE_CHUNKS = 15

async function retrieveSingleFile(
  query: string,
  fileId: string,
  folderIds: string[],
  startMs: number,
  matchedFileName?: string,
  suppressAssumption = false,
): Promise<RetrievalResult> {
  // Query by cosine similarity scoped to this file, capped at MAX_SINGLE_FILE_CHUNKS.
  // queryFile handles embedding, scoring, and sorting — results come back sorted by score.
  const queryEmbedding = await embeddings.embed(query)
  const topMatches = await vectorStore.queryFile(queryEmbedding, fileId, MAX_SINGLE_FILE_CHUNKS)

  // Re-sort by chunk index so the answer reads in document order
  const matches = [...topMatches].sort(
    (a, b) => (a.metadata.chunkIndex ?? 0) - (b.metadata.chunkIndex ?? 0),
  )

  const retrievalLatencyMs = Date.now() - startMs

  const selectedChunks: RetrievedChunk[] = matches.map((match, i) => ({
    chunkId: match.id,
    fileId: match.metadata.fileId,
    fileName: match.metadata.fileName,
    folderId: match.metadata.folderId,
    text: match.metadata.text,
    score: match.score,
    rank: i + 1,
    selected: true,
  }))

  const debugInfo: RetrievalDebugInfo = {
    query,
    intent: 'single_file_deep',
    retrievedChunks: selectedChunks,
    selectedChunkIds: selectedChunks.map((c) => c.chunkId),
    totalRetrieved: selectedChunks.length,
    totalSelected: selectedChunks.length,
    retrievalLatencyMs,
    generationLatencyMs: 0,
    totalLatencyMs: 0,
  }

  // Use the actual file name from the first chunk (more accurate than the classifier's extraction).
  // Skip the assumption note when the file was pinned via a quote selection — the user
  // knows exactly which document they're referencing.
  const resolvedName = selectedChunks[0]?.fileName ?? matchedFileName
  const assumption =
    !suppressAssumption && resolvedName
      ? `Interpreting this as a question about **${resolvedName}**. If you meant something else, try rephrasing with the exact file name.`
      : undefined

  return {
    selectedChunks,
    debugInfo,
    isSupported: selectedChunks.length > 0,
    folderIds,
    intent: 'single_file_deep',
    assumption,
  }
}

// ---------------------------------------------------------------------------
// Keyword search — used as a fallback for numbered item queries
// (e.g. "question 35", "section 4.2") where cosine similarity fails because
// all chunks look semantically identical (e.g. exam questions).
// Searches TextChunk.text directly for the number pattern.
// ---------------------------------------------------------------------------

async function keywordSearchNumberedItem(
  query: string,
  folderIds: string[],
): Promise<RetrievedChunk[]> {
  // Extract a number from patterns like "question 35", "q35", "item 12", "section 4"
  const match = query.match(/\b(?:question|q|item|section|problem|exercise|number|#)\s*(\d+)\b/i)
    ?? query.match(/\b(\d+)\b/)

  if (!match) return []
  const num = match[1]

  // Search for chunks containing the number followed by a period and space —
  // the standard format for numbered lists and exam questions: "35. Which of..."
  // PDF chunks often have no newlines between questions, so we match " 35. " (space-prefixed).
  const chunks = await prisma.textChunk.findMany({
    where: {
      folderId: { in: folderIds },
      OR: [
        { text: { contains: ` ${num}. ` } },   // " 35. " — most common in PDFs
        { text: { contains: `\n${num}. ` } },   // newline before (structured docs)
        { text: { startsWith: `${num}. ` } },   // starts with "35. " (first chunk)
      ],
    },
    select: {
      id: true, text: true, folderId: true, fileId: true, chunkIndex: true,
      file: { select: { name: true } },
    },
    take: 5,
  })

  return chunks.map((c, i) => ({
    chunkId: c.id,
    fileId: c.fileId,
    fileName: c.file.name,
    folderId: c.folderId,
    text: c.text,
    score: 0.99, // boost keyword matches to the top
    rank: i + 1,
    selected: true,
  }))
}

// ---------------------------------------------------------------------------
// targeted_fact: cosine similarity with spread fallback (original behavior)
// ---------------------------------------------------------------------------

async function retrieveTargetedFact(
  query: string,
  folderIds: string[],
  isMultiFolder: boolean,
  startMs: number,
  intent: QueryIntent,
): Promise<RetrievalResult> {
  // Run cosine similarity and keyword search in parallel
  const queryEmbedding = await embeddings.embed(query)
  const fetchK = isMultiFolder ? TOP_K_RETRIEVAL * 2 : TOP_K_RETRIEVAL
  const [matches, keywordChunks] = await Promise.all([
    vectorStore.query(queryEmbedding, fetchK, { folderIds }),
    keywordSearchNumberedItem(query, folderIds),
  ])
  const retrievalLatencyMs = Date.now() - startMs

  const cosineChunks: RetrievedChunk[] = matches.map((match, i) => ({
    chunkId: match.id,
    fileId: match.metadata.fileId,
    fileName: match.metadata.fileName,
    folderId: match.metadata.folderId,
    text: match.metadata.text,
    score: match.score,
    rank: i + 1,
    selected: false,
  }))

  // Merge keyword matches at the front (score 0.99), deduplicating by chunkId
  const cosineIds = new Set(cosineChunks.map((c) => c.chunkId))
  const newKeywordChunks = keywordChunks.filter((c) => !cosineIds.has(c.chunkId))
  const allChunks: RetrievedChunk[] = [...newKeywordChunks, ...cosineChunks]

  const topScore = allChunks[0]?.score ?? 0
  let selectedChunks: RetrievedChunk[]

  if (isMultiFolder) {
    // Balanced per-folder selection
    const minPerFolder = Math.max(1, Math.floor(TOP_K_CONTEXT / folderIds.length))
    const selected = new Map<string, RetrievedChunk[]>()
    const used = new Set<string>()

    // Pass 1: fill minimum per folder
    for (const fid of folderIds) {
      const folderChunks = allChunks
        .filter((c) => c.folderId === fid && c.score >= UNSUPPORTED_SCORE_THRESHOLD)
        .slice(0, minPerFolder)
        .map((c) => ({ ...c, selected: true }))
      selected.set(fid, folderChunks)
      folderChunks.forEach((c) => used.add(c.chunkId))
    }

    // Pass 2: fill remaining slots from global top
    const currentCount = Array.from(selected.values()).reduce((n, arr) => n + arr.length, 0)
    const remaining = TOP_K_CONTEXT - currentCount
    if (remaining > 0) {
      const fillers = allChunks
        .filter((c) => !used.has(c.chunkId) && c.score >= MIN_RELEVANCE_SCORE)
        .slice(0, remaining)
        .map((c) => ({ ...c, selected: true }))
      fillers.forEach((c) => {
        const arr = selected.get(c.folderId) ?? []
        arr.push(c)
        selected.set(c.folderId, arr)
      })
    }

    selectedChunks = Array.from(selected.values())
      .flat()
      .sort((a, b) => b.score - a.score)

    // Fallback: spread across files if nothing met threshold
    if (selectedChunks.length === 0) {
      const fileMap = new Map<string, RetrievedChunk>()
      for (const chunk of allChunks) {
        if (!fileMap.has(chunk.fileId)) fileMap.set(chunk.fileId, chunk)
      }
      selectedChunks = Array.from(fileMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K_CONTEXT)
        .map((c) => ({ ...c, selected: true }))
    }
  } else {
    // Single folder: top N above threshold
    selectedChunks = allChunks
      .filter((c) => c.score >= MIN_RELEVANCE_SCORE)
      .slice(0, TOP_K_CONTEXT)
      .map((c) => ({ ...c, selected: true }))

    // Spread fallback for broad/low-signal queries
    if (selectedChunks.length === 0 || topScore < 0.40) {
      const fileMap = new Map<string, RetrievedChunk>()
      for (const chunk of allChunks) {
        if (!fileMap.has(chunk.fileId)) fileMap.set(chunk.fileId, chunk)
      }
      const spreadChunks = Array.from(fileMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K_CONTEXT)
        .map((c) => ({ ...c, selected: true }))
      if (spreadChunks.length > selectedChunks.length) {
        selectedChunks = spreadChunks
      }
    }
  }

  const selectedIds = new Set(selectedChunks.map((c) => c.chunkId))
  const debugChunks = allChunks.map((c) => ({ ...c, selected: selectedIds.has(c.chunkId) }))

  const debugInfo: RetrievalDebugInfo = {
    query,
    intent,
    retrievedChunks: debugChunks,
    selectedChunkIds: Array.from(selectedIds),
    totalRetrieved: allChunks.length,
    totalSelected: selectedChunks.length,
    retrievalLatencyMs,
    generationLatencyMs: 0,
    totalLatencyMs: 0,
  }

  return {
    selectedChunks,
    debugInfo,
    isSupported: allChunks.length > 0,
    folderIds,
    intent,
  }
}
