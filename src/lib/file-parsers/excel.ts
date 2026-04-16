import * as XLSX from 'xlsx'
import type { ParsedFile } from '@/types'

export function parseExcel(
  buffer: Buffer,
  fileId: string,
  fileName: string,
  mimeType: string,
): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const lines: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    if (rows.length === 0) continue
    lines.push(`Sheet: ${sheetName}`)

    const headers = rows[0].map(String)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const hasContent = row.some((cell) => String(cell).trim() !== '')
      if (!hasContent) continue
      const pairs = headers
        .map((h, j) => `${h}: ${String(row[j] ?? '').trim()}`)
        .filter((p) => !p.endsWith(': '))
      if (pairs.length > 0) lines.push(pairs.join(' | '))
    }

    lines.push('')
  }

  return {
    fileId,
    fileName,
    mimeType,
    content: lines.join('\n').trim(),
  }
}
