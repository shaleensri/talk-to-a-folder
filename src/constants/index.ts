// ---------------------------------------------------------------------------
// Ingestion limits
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  // 20 MB per file
export const MAX_FILES_PER_FOLDER = 200
export const CHUNK_SIZE_CHARS = 1800                  // ~450 tokens
export const CHUNK_OVERLAP_CHARS = 200                // ~50 tokens

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const TOP_K_RETRIEVAL = 8              // chunks retrieved from vector store
export const TOP_K_CONTEXT = 5               // chunks passed to LLM
export const MIN_RELEVANCE_SCORE = 0.30      // below this = likely off-topic
export const UNSUPPORTED_SCORE_THRESHOLD = 0.20 // below all chunks → "unsupported" answer

// ---------------------------------------------------------------------------
// Supported MIME types
// ---------------------------------------------------------------------------

export const SUPPORTED_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/pdf': 'PDF',
  'text/plain': 'Plain Text',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Doc',
  'application/msword': 'Word Doc (legacy)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel (legacy)',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/vnd.ms-powerpoint': 'PowerPoint (legacy)',
}

export const SUPPORTED_MIME_TYPE_LIST = Object.keys(SUPPORTED_MIME_TYPES)

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536
export const CHAT_MODEL = 'gpt-4o'

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export const SIDEBAR_WIDTH = 240          // px
export const SOURCES_PANEL_WIDTH = 360    // px
export const TOPBAR_HEIGHT = 56           // px

// ---------------------------------------------------------------------------
// Demo / mock data folder IDs
// ---------------------------------------------------------------------------

export const MOCK_FOLDER_ID = 'mock-folder-q4-strategy'
