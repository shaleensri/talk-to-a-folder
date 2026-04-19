import type { ParsedFile } from '@/types'

export async function parsePowerPoint(
  buffer: Buffer,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<ParsedFile> {
  // officeparser v6: named export is `parseOffice` (async), returns AST with .toText()
  const { parseOffice } = await import('officeparser')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ast: any = await parseOffice(buffer)
  const content: string = typeof ast.toText === 'function' ? ast.toText() : String(ast)
  return {
    fileId,
    fileName,
    mimeType,
    content: content.trim(),
  }
}
