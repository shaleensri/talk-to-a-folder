import type { IndexedFolder, DriveFile, IngestionProgress } from './folder'
import type { ChatMessage, Citation, AnswerMetadata } from './chat'
import type { RetrievalDebugInfo } from './retrieval'

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

export interface CreateFolderRequest {
  driveUrl: string
}

export interface ChatRequest {
  folderId: string
  message: string
  sessionId?: string
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  data?: T
  error?: string
  code?: string
}

export interface FolderListResponse {
  folders: IndexedFolder[]
}

export interface FolderResponse {
  folder: IndexedFolder
}

export interface FolderFilesResponse {
  files: DriveFile[]
}

export interface IngestionStatusResponse {
  status: IngestionProgress
}

export interface ChatResponse {
  messageId: string
  sessionId: string
  answer: string
  citations: Citation[]
  metadata: AnswerMetadata
  debug: RetrievalDebugInfo
}

// Used when the answer can't be grounded in folder contents
export interface UnsupportedAnswerResponse {
  messageId: string
  sessionId: string
  answer: string
  citations: []
  metadata: AnswerMetadata & { confidence: 'unsupported' }
  debug: RetrievalDebugInfo
}

// Streaming chunk format (SSE)
export interface StreamChunk {
  type: 'token' | 'citations' | 'metadata' | 'debug' | 'done' | 'error'
  payload: unknown
}
