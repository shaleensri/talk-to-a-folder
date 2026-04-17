import { embeddings } from './embeddings'
import { vectorStore } from './vector-store'
import {
  TOP_K_RETRIEVAL,
  TOP_K_CONTEXT,
  MIN_RELEVANCE_SCORE,
  UNSUPPORTED_SCORE_THRESHOLD,
} from '@/constants'
import type { RetrievedChunk, RetrievalDebugInfo } from '@/types'

const SUMMARIZATION_PATTERNS = [
  'summarize', 'summarise', 'summary', 'overview',
  'what is in', "what's in", 'whats in',
  'about this', 'about this folder', 'about these',
  'tell me about', 'describe', 'what does this', 'what do these',
  'give me an overview', 'give an overview',
]

const COMPARISON_PATTERNS = [
  'compare', 'comparison', 'versus', ' vs ', 'difference between',
  'similarities between', 'contrast', 'both folders', 'across folders',
  'how do they differ', 'how are they different', 'how are they similar',
]

export function isSummarizationQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return SUMMARIZATION_PATTERNS.some((p) => lower.includes(p))
}

export function isComparisonQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return COMPARISON_PATTERNS.some((p) => lower.includes(p))
}

export interface RetrievalResult {
  selectedChunks: RetrievedChunk[]
  debugInfo: RetrievalDebugInfo
  isSupported: boolean  // false if no chunks meet the minimum threshold
  folderIds: string[]   // folders that were queried (for multi-folder labeling)
}

/**
 * Full retrieval pipeline:
 * 1. Embed the query
 * 2. Search vector store for top-K matches
 * 3. Apply relevance threshold to determine if answer is supportable
 * 4. Select top N for LLM context — with balanced multi-folder coverage
 * 5. Return both selected chunks and debug info
 */
export async function retrieve(
  query: string,
  folderIds: string[],
): Promise<RetrievalResult> {
  const startMs = Date.now()
  const isMultiFolder = folderIds.length > 1

  // 1. Embed query
  const queryEmbedding = await embeddings.embed(query)

  const isSummarize = isSummarizationQuery(query)

  let allChunks: RetrievedChunk[]
  let retrievalLatencyMs: number

  if (isSummarize) {
    // Summarization: skip similarity search entirely. Fetch the first chunk of every
    // file directly from the DB — guarantees all files are represented regardless of
    // how their content embeds relative to the query.
    const matches = await vectorStore.getFirstChunksPerFile(folderIds)
    retrievalLatencyMs = Date.now() - startMs
    allChunks = matches.map((match, i) => ({
      chunkId: match.id,
      fileId: match.metadata.fileId,
      fileName: match.metadata.fileName,
      folderId: match.metadata.folderId,
      text: match.metadata.text,
      score: match.score,
      rank: i + 1,
      selected: false,
    }))
  } else {
    // 2. Vector search — retrieve more candidates for multi-folder queries
    const fetchK = isMultiFolder ? TOP_K_RETRIEVAL * 2 : TOP_K_RETRIEVAL
    const matches = await vectorStore.query(queryEmbedding, fetchK, { folderIds })
    retrievalLatencyMs = Date.now() - startMs
    allChunks = matches.map((match, i) => ({
      chunkId: match.id,
      fileId: match.metadata.fileId,
      fileName: match.metadata.fileName,
      folderId: match.metadata.folderId,
      text: match.metadata.text,
      score: match.score,
      rank: i + 1,
      selected: false,
    }))
  }

  // 3. Check if any chunk meets the minimum threshold
  const topScore = isSummarize ? 1.0 : (allChunks[0]?.score ?? 0)
  const isSupported = allChunks.length > 0

  let selectedChunks: RetrievedChunk[]

  if (isSummarize) {
    // 4a. Summarization: include all per-file chunks (already one per file from DB query).
    //     Cap at 12 to stay within context limits; if folder has >12 files, take all anyway
    //     since this is already the minimal representation.
    selectedChunks = allChunks
      .slice(0, 12)
      .map((c) => ({ ...c, selected: true }))
  } else if (isMultiFolder) {
    // 5b. Multi-folder: guarantee balanced coverage so every folder gets a voice.
    //     Minimum per folder = floor(TOP_K_CONTEXT / numFolders), at least 1.
    //     Fill remaining slots with the globally highest-scoring chunks.
    const minPerFolder = Math.max(1, Math.floor(TOP_K_CONTEXT / folderIds.length))
    const selected = new Map<string, RetrievedChunk[]>() // folderId → chunks
    const used = new Set<string>() // chunkIds already picked

    // Pass 1: fill per-folder minimums (best chunks per folder)
    for (const fid of folderIds) {
      const folderChunks = allChunks
        .filter((c) => c.folderId === fid && c.score >= UNSUPPORTED_SCORE_THRESHOLD)
        .slice(0, minPerFolder)
        .map((c) => ({ ...c, selected: true }))
      selected.set(fid, folderChunks)
      folderChunks.forEach((c) => used.add(c.chunkId))
    }

    // Pass 2: fill remaining slots from global top (meeting MIN_RELEVANCE_SCORE)
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

    // Flatten and re-sort by score so the context reads naturally
    selectedChunks = Array.from(selected.values())
      .flat()
      .sort((a, b) => b.score - a.score)

    // Fallback: if we still have nothing, spread across files
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
    // 5c. Normal single-folder Q&A: top N chunks that meet the minimum relevance threshold
    selectedChunks = allChunks
      .filter((c) => c.score >= MIN_RELEVANCE_SCORE)
      .slice(0, TOP_K_CONTEXT)
      .map((c) => ({ ...c, selected: true }))

    // 6. For broad questions (low top score or no selected chunks),
    //    spread: take the best chunk from each unique file so all files are represented.
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

  // Mark selected in allChunks for debug view
  const debugChunks = allChunks.map((c) => ({
    ...c,
    selected: selectedIds.has(c.chunkId),
  }))

  const debugInfo: RetrievalDebugInfo = {
    query,
    retrievedChunks: debugChunks,
    selectedChunkIds: Array.from(selectedIds),
    totalRetrieved: allChunks.length,
    totalSelected: selectedChunks.length,
    retrievalLatencyMs,
    generationLatencyMs: 0, // filled in by answer generator
    totalLatencyMs: 0,       // filled in by answer generator
  }

  return { selectedChunks, debugInfo, isSupported, folderIds }
}
