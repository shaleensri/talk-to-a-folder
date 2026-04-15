import type { ParsedFile } from '@/types'

/**
 * Google Docs are exported as plain text via the Drive API.
 * No additional parsing needed — just clean up whitespace.
 */
export async function parseGoogleDoc(
  content: string,
  fileId: string,
  fileName: string,
): Promise<ParsedFile> {
  const cleaned = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    fileId,
    fileName,
    mimeType: 'application/vnd.google-apps.document',
    content: cleaned,
  }
}
