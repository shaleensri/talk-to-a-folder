import type { ParsedFile } from '@/types'

/**
 * Google Sheets are exported as CSV via the Drive API.
 * Converts CSV to a readable prose-like format for better embedding quality.
 */
export async function parseGoogleSheet(
  csvContent: string,
  fileId: string,
  fileName: string,
): Promise<ParsedFile> {
  const lines = csvContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      fileId,
      fileName,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      content: '',
    }
  }

  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1).map(parseCSVLine)

  // Convert to readable text: "Header1: Value1, Header2: Value2"
  const sections = rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      return headers
        .map((header, i) => {
          const value = row[i]?.trim() ?? ''
          return value ? `${header}: ${value}` : null
        })
        .filter(Boolean)
        .join(', ')
    })
    .filter(Boolean)

  const content = [
    `Spreadsheet: ${fileName}`,
    `Columns: ${headers.join(', ')}`,
    '',
    ...sections,
  ].join('\n')

  return {
    fileId,
    fileName,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    content,
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}
