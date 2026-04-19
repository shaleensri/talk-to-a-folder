import type { TextChunk } from '@/types'
import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS } from '@/constants'
import { generateId } from './utils'

/**
 * Splits a document's plain text into overlapping chunks.
 *
 * Strategy:
 * 1. Try to split on paragraph breaks (double newlines) first
 * 2. Fall back to sentence splits if a paragraph is too long
 * 3. Fall back to hard splits as a last resort
 *
 * This ensures chunks don't cut mid-sentence, which improves embedding quality.
 */
export function chunkText(
  text: string,
  fileId: string,
  folderId: string,
  options?: { chunkSize?: number; overlap?: number },
): TextChunk[] {
  const chunkSize = options?.chunkSize ?? CHUNK_SIZE_CHARS
  const overlap = options?.overlap ?? CHUNK_OVERLAP_CHARS

  if (!text.trim()) return []

  // Split into natural paragraphs first
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const rawSegments: string[] = []

  for (const para of paragraphs) {
    if (para.length <= chunkSize) {
      rawSegments.push(para)
    } else {
      // Split long paragraphs on sentence boundaries
      const sentences = para.split(/(?<=[.!?])\s+/)
      let current = ''
      for (const sentence of sentences) {
        if ((current + ' ' + sentence).trim().length > chunkSize) {
          if (current) rawSegments.push(current.trim())
          current = sentence
        } else {
          current = current ? current + ' ' + sentence : sentence
        }
      }
      if (current.trim()) rawSegments.push(current.trim())
    }
  }

  // Merge small adjacent segments and apply overlap
  const chunks: TextChunk[] = []
  let buffer = ''
  let startChar = 0
  let charPos = 0
  let chunkIndex = 0

  for (const segment of rawSegments) {
    const candidate = buffer ? buffer + '\n\n' + segment : segment

    if (candidate.length > chunkSize && buffer) {
      // Save current buffer as a chunk
      const endChar = startChar + buffer.length
      chunks.push({
        id: generateId(),
        fileId,
        folderId,
        text: buffer,
        chunkIndex: chunkIndex++,
        startChar,
        endChar,
      })

      // Next chunk starts with overlap from end of current chunk
      const overlapText = buffer.slice(Math.max(0, buffer.length - overlap))
      startChar = endChar - overlapText.length
      buffer = overlapText ? overlapText + '\n\n' + segment : segment
    } else {
      buffer = candidate
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    chunks.push({
      id: generateId(),
      fileId,
      folderId,
      text: buffer,
      chunkIndex: chunkIndex++,
      startChar,
      endChar: startChar + buffer.length,
    })
  }

  return chunks
}
