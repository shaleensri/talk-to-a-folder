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
- single_file_deep: asks about one specific named file (e.g. "what does Interview uncle.docx say", "tell me about the Q3 report", "explain the resume file", "what's in the M&M lab doc")
- cross_folder_compare: wants to compare content across multiple folders (e.g. "compare these folders", "how do they differ", "what's different between them", "similarities between folders")
- targeted_fact: any question about the subject matter, content, or implications of the documents — even if phrased analytically, evaluatively, or subjectively (e.g. "what were the revenue projections", "who wrote the memo", "what is the conclusion about X", "when did Y happen", "what are my chances", "how strong is this proposal", "what would an investor think", "how should I prepare", "what are the risks", "is this a good plan")
- off_topic: ONLY for pure small talk or greetings with zero relation to documents or their content (e.g. "sup", "hey", "thanks", "how are you", "lol", "ok", "cool", "what's 2+2"). If there is ANY chance the question relates to the documents or their subject matter, do NOT classify as off_topic — use targeted_fact instead.

IMPORTANT: When in doubt between targeted_fact and off_topic, always choose targeted_fact.

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
): Promise<RetrievalResult> {
  const startMs = Date.now()
  const isMultiFolder = folderIds.length > 1

  // Classify intent before doing any retrieval
  const { intent, targetFileName } = await classifyIntent(query, history, isMultiFolder)

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
    return retrieveBroadSummary(query, folderIds, intent, startMs)
  }

  if (intent === 'single_file_deep') {
    const fileId = targetFileName ? await findFileByName(targetFileName, folderIds) : null
    if (fileId) {
      return retrieveSingleFile(query, fileId, folderIds, startMs, targetFileName)
    }
    // File not found by name — fall back to cosine similarity with an assumption note
    const fallback = await retrieveTargetedFact(query, folderIds, isMultiFolder, startMs, 'targeted_fact')
    if (targetFileName) {
      fallback.assumption = `Couldn't find a file matching "${targetFileName}" — searching across all documents instead. Try using the exact file name if you meant a specific file.`
    }
    return fallback
  }

  // targeted_fact (or single_file_deep fallback)
  return retrieveTargetedFact(query, folderIds, isMultiFolder, startMs, intent)
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

async function retrieveSingleFile(
  query: string,
  fileId: string,
  folderIds: string[],
  startMs: number,
  matchedFileName?: string,
): Promise<RetrievalResult> {
  const matches = await vectorStore.getAllChunksForFile(fileId)

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

  // Use the actual file name from the first chunk (more accurate than the classifier's extraction)
  const resolvedName = selectedChunks[0]?.fileName ?? matchedFileName
  const assumption = resolvedName
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
// targeted_fact: cosine similarity with spread fallback (original behavior)
// ---------------------------------------------------------------------------

async function retrieveTargetedFact(
  query: string,
  folderIds: string[],
  isMultiFolder: boolean,
  startMs: number,
  intent: QueryIntent,
): Promise<RetrievalResult> {
  const queryEmbedding = await embeddings.embed(query)

  const fetchK = isMultiFolder ? TOP_K_RETRIEVAL * 2 : TOP_K_RETRIEVAL
  const matches = await vectorStore.query(queryEmbedding, fetchK, { folderIds })
  const retrievalLatencyMs = Date.now() - startMs

  const allChunks: RetrievedChunk[] = matches.map((match, i) => ({
    chunkId: match.id,
    fileId: match.metadata.fileId,
    fileName: match.metadata.fileName,
    folderId: match.metadata.folderId,
    text: match.metadata.text,
    score: match.score,
    rank: i + 1,
    selected: false,
  }))

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
