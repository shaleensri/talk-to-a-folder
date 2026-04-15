import type { ParsedFile } from '@/types'

/**
 * Handles plain text, markdown, and CSV files.
 * These are already readable — just clean and return.
 */
export async function parsePlainText(
  rawContent: string,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<ParsedFile> {
  const content = rawContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    fileId,
    fileName,
    mimeType,
    content,
  }
}
