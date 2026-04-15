export interface VectorRecord {
  id: string          // chunk ID
  embedding: number[]
  metadata: {
    folderId: string
    fileId: string
    fileName: string
    text: string
    chunkIndex: number
  }
}

export interface VectorMatch {
  id: string
  score: number       // cosine similarity 0–1
  metadata: VectorRecord['metadata']
}

export interface RetrievedChunk {
  chunkId: string
  fileId: string
  fileName: string
  text: string
  score: number
  rank: number        // 1-based position in retrieved set
  selected: boolean   // whether it was included in the LLM context
}

export interface RetrievalDebugInfo {
  query: string
  retrievedChunks: RetrievedChunk[]
  selectedChunkIds: string[]
  totalRetrieved: number
  totalSelected: number
  retrievalLatencyMs: number
  generationLatencyMs: number
  totalLatencyMs: number
}

// Parsed file output from a FileParser
export interface ParsedFile {
  fileId: string
  fileName: string
  mimeType: string
  content: string     // full extracted plain text
  metadata?: Record<string, unknown>
}

// A text chunk ready for embedding
export interface TextChunk {
  id: string
  fileId: string
  folderId: string
  text: string
  chunkIndex: number
  startChar: number
  endChar: number
}
