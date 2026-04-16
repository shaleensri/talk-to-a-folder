import { embeddings } from './embeddings'
import { vectorStore } from './vector-store'
import {
  TOP_K_RETRIEVAL,
  TOP_K_CONTEXT,
  MIN_RELEVANCE_SCORE,
  UNSUPPORTED_SCORE_THRESHOLD,
} from '@/constants'
import type { RetrievedChunk, RetrievalDebugInfo } from '@/types'

export interface RetrievalResult {
  selectedChunks: RetrievedChunk[]
  debugInfo: RetrievalDebugInfo
  isSupported: boolean  // false if no chunks meet the minimum threshold
}

/**
 * Full retrieval pipeline:
 * 1. Embed the query
 * 2. Search vector store for top-K matches
 * 3. Apply relevance threshold to determine if answer is supportable
 * 4. Select top N for LLM context
 * 5. Return both selected chunks and debug info
 */
export async function retrieve(
  query: string,
  folderId: string,
): Promise<RetrievalResult> {
  const startMs = Date.now()

  // 1. Embed query
  const queryEmbedding = await embeddings.embed(query)

  // 2. Vector search
  const matches = await vectorStore.query(queryEmbedding, TOP_K_RETRIEVAL, { folderId })

  const retrievalLatencyMs = Date.now() - startMs

  // 3. Map to RetrievedChunk with rank
  const allChunks: RetrievedChunk[] = matches.map((match, i) => ({
    chunkId: match.id,
    fileId: match.metadata.fileId,
    fileName: match.metadata.fileName,
    text: match.metadata.text,
    score: match.score,
    rank: i + 1,
    selected: false,
  }))

  // 4. Check if any chunk meets the minimum threshold
  const topScore = allChunks[0]?.score ?? 0
  const isSupported = topScore >= UNSUPPORTED_SCORE_THRESHOLD || allChunks.length > 0

  // 5. Select top N chunks that meet the minimum relevance threshold
  let selectedChunks = allChunks
    .filter((c) => c.score >= MIN_RELEVANCE_SCORE)
    .slice(0, TOP_K_CONTEXT)
    .map((c) => ({ ...c, selected: true }))

  // 6. For broad/overview questions (low top score or no selected chunks),
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

  return { selectedChunks, debugInfo, isSupported }
}
