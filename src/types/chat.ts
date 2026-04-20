export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unsupported' | 'off_topic'

export interface Citation {
  id: string
  index: number             // 1-based, matches [1][2][3] in answer text
  fileId: string
  fileName: string
  chunkId: string
  chunkText: string         // full chunk text
  highlightText?: string    // specific span to highlight within chunk
  relevanceScore: number    // 0–1 cosine similarity
}

export interface AnswerMetadata {
  filesUsed: number
  chunksUsed: number
  confidence: ConfidenceLevel
  confidenceReason?: string
  latencyMs: number
  model: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  metadata?: AnswerMetadata
  debugInfo?: import('./retrieval').RetrievalDebugInfo
  createdAt: Date
  // Transient UI state — not persisted
  isStreaming?: boolean
  streamedContent?: string
}

export interface SuggestedQuestion {
  id: string
  text: string
}

export interface QuotedContext {
  text: string    // the selected text shown in the composer block
  fileId: string  // DriveFile.id — used to pin retrieval to this file
}

export interface ChatTab {
  id: string
  sessionId: string | null
  folderIds: string[]       // folders this chat references
  messages: ChatMessage[]
  isStreaming: boolean
  currentCitations: Citation[]
  quotedText: QuotedContext | null // text selected in document viewer, prepended to next message
}
