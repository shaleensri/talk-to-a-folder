import type { ParsedFile } from '@/types'

export async function parsePowerPoint(
  buffer: Buffer,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<ParsedFile> {
  // officeparser doesn't have great TS types — import dynamically
  const { parseOfficeAsync } = await import('officeparser')
  const content: string = await parseOfficeAsync(buffer)
  return {
    fileId,
    fileName,
    mimeType,
    content: content.trim(),
  }
}
