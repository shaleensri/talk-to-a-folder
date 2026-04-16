import mammoth from 'mammoth'
import type { ParsedFile } from '@/types'

export async function parseWord(
  buffer: Buffer,
  fileId: string,
  fileName: string,
): Promise<ParsedFile> {
  const result = await mammoth.extractRawText({ buffer })
  return {
    fileId,
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: result.value.trim(),
  }
}
