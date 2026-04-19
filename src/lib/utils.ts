import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract Google Drive folder ID from any Drive URL format */
export function extractFolderIdFromUrl(url: string): string | null {
  // formats:
  //   https://drive.google.com/drive/folders/<ID>
  //   https://drive.google.com/drive/u/0/folders/<ID>
  //   https://drive.google.com/open?id=<ID>
  const patternsn = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ]
  for (const pattern of patternsn) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

/** Format a file size in bytes to human-readable */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format a date to a relative time string */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Format a Date to display string */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Truncate a string to maxLength with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

/** Generate a unique ID (client-safe) */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

/** Get a file extension from a MIME type */
export function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'gdoc',
    'application/vnd.google-apps.spreadsheet': 'gsheet',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/csv': 'csv',
  }
  return map[mimeType] ?? 'file'
}

/** Get icon name based on MIME type */
export function mimeTypeToIcon(mimeType: string): string {
  if (mimeType.includes('document')) return 'FileText'
  if (mimeType.includes('spreadsheet')) return 'Sheet'
  if (mimeType === 'application/pdf') return 'FileText'
  if (mimeType.startsWith('text/')) return 'FileCode'
  return 'File'
}

/** Format a similarity score to display */
export function formatScore(score: number): string {
  return (score * 100).toFixed(0) + '%'
}

/** Parse citation markers [1][2] from text and return text + citation indices */
export function parseCitationIndices(text: string): number[] {
  const matches = text.matchAll(/\[(\d+)\]/g)
  const indices = new Set<number>()
  for (const match of matches) {
    indices.add(parseInt(match[1]))
  }
  return Array.from(indices).sort((a, b) => a - b)
}
