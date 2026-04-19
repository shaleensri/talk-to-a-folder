import type { ParsedFile } from '@/types'

/**
 * Parses a PDF buffer using pdf-parse.
 * Returns clean plain text ready for chunking.
 */
export async function parsePDF(
  buffer: Buffer,
  fileId: string,
  fileName: string,
): Promise<ParsedFile> {
  // Dynamic import to avoid issues with pdf-parse test file check at module load time
  const pdfParse = (await import('pdf-parse')).default

  const data = await pdfParse(buffer)

  const content = data.text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    fileId,
    fileName,
    mimeType: 'application/pdf',
    content,
    metadata: {
      pageCount: data.numpages,
      info: data.info,
    },
  }
}
