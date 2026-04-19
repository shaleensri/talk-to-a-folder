export type FolderStatus = 'idle' | 'ingesting' | 'indexed' | 'error'

export type FileStatus = 'pending' | 'parsing' | 'indexed' | 'error' | 'skipped'

export interface IndexedFolder {
  id: string
  name: string
  driveUrl: string
  folderId: string        // Google Drive folder ID extracted from URL
  status: FolderStatus
  fileCount: number
  chunkCount: number
  lastIndexed: Date | null
  errorMessage?: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface DriveFile {
  id: string
  folderId: string
  driveFileId: string
  name: string
  mimeType: string
  size: number | null
  status: FileStatus
  errorMessage?: string
  parsedAt: Date | null
}

export interface IngestionProgress {
  folderId: string
  status: FolderStatus
  progress: {
    total: number
    parsed: number
    indexed: number
    failed: number
    skipped: number
  }
  currentFile?: string
  errorMessage?: string
}

// Supported MIME types for ingestion
export type SupportedMimeType =
  | 'application/vnd.google-apps.document'
  | 'application/vnd.google-apps.spreadsheet'
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'text/csv'
