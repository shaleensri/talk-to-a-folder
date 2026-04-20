import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { parseGoogleDoc } from '@/lib/file-parsers/google-doc'
import { parseGoogleSheet } from '@/lib/file-parsers/google-sheet'
import { parsePlainText } from '@/lib/file-parsers/plain-text'
import { parseExcel } from '@/lib/file-parsers/excel'

/**
 * Creates an in-memory XLSX buffer with the given sheet data.
 * Used to test the Excel parser without real files.
 */
function makeXlsxBuffer(sheetsData: Record<string, string[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheetsData)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

describe('file parsers', () => {
  it('normalizes Google Doc whitespace', async () => {
    const parsed = await parseGoogleDoc('Title\r\n\r\n\r\nBody\rEnd', 'file-1', 'Doc')

    assert.equal(parsed.fileId, 'file-1')
    assert.equal(parsed.fileName, 'Doc')
    assert.equal(parsed.mimeType, 'application/vnd.google-apps.document')
    assert.equal(parsed.content, 'Title\n\nBody\nEnd')
  })

  it('normalizes plain text whitespace and preserves MIME type', async () => {
    const parsed = await parsePlainText('A\r\n\r\n\r\nB\n', 'file-1', 'notes.md', 'text/markdown')

    assert.equal(parsed.mimeType, 'text/markdown')
    assert.equal(parsed.content, 'A\n\nB')
  })

  it('converts Google Sheet CSV into readable row text', async () => {
    const parsed = await parseGoogleSheet(
      'Name,Status,Notes\n"Acme, Inc",Active,"Uses ""quoted"" text"\nBeta,,No status\n',
      'sheet-1',
      'Accounts',
    )

    assert.equal(parsed.mimeType, 'application/vnd.google-apps.spreadsheet')
    assert.match(parsed.content, /Spreadsheet: Accounts/)
    assert.match(parsed.content, /Columns: Name, Status, Notes/)
    assert.match(parsed.content, /Name: Acme, Inc, Status: Active, Notes: Uses "quoted" text/)
    assert.match(parsed.content, /Name: Beta, Notes: No status/)
  })

  // ---------------------------------------------------------------------------
  // Excel parser
  // ---------------------------------------------------------------------------

  it('parseExcel returns the correct fileId, fileName and mimeType', () => {
    const buf = makeXlsxBuffer({ Sheet1: [['Name', 'Score'], ['Alice', '95'], ['Bob', '82']] })
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    const parsed = parseExcel(buf, 'file-xl', 'Scores.xlsx', mimeType)

    assert.equal(parsed.fileId, 'file-xl')
    assert.equal(parsed.fileName, 'Scores.xlsx')
    assert.equal(parsed.mimeType, mimeType)
  })

  it('parseExcel converts rows to key:value pipe-separated lines', () => {
    const buf = makeXlsxBuffer({ Sheet1: [['Name', 'Score'], ['Alice', '95'], ['Bob', '82']] })

    const { content } = parseExcel(buf, 'file-xl', 'Scores.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    assert.match(content, /Name: Alice \| Score: 95/)
    assert.match(content, /Name: Bob \| Score: 82/)
  })

  it('parseExcel includes a sheet header for each sheet', () => {
    const buf = makeXlsxBuffer({
      Q1: [['Item', 'Amount'], ['Revenue', '100']],
      Q2: [['Item', 'Amount'], ['Revenue', '200']],
    })

    const { content } = parseExcel(buf, 'file-xl', 'Report.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    assert.match(content, /Sheet: Q1/)
    assert.match(content, /Sheet: Q2/)
    assert.match(content, /Revenue/)
  })

  it('parseExcel skips entirely empty rows', () => {
    const buf = makeXlsxBuffer({
      // Single-column sheet: header + 2 data rows + 2 blank rows
      Sheet1: [['Col'], ['Value'], [''], ['Another']],
    })

    const { content } = parseExcel(buf, 'file-xl', 'Data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    // Both data rows appear
    assert.match(content, /Col: Value/)
    assert.match(content, /Col: Another/)
    // The blank row between them should not produce a "Col: " entry with no value
    // Count how many times "Col:" appears — should be exactly 2 (Value and Another)
    const matches = content.match(/Col:/g) ?? []
    assert.equal(matches.length, 2)
  })

  it('parseExcel produces double-newlines between rows so the chunker splits correctly', () => {
    const buf = makeXlsxBuffer({ Sheet1: [['A', 'B'], ['1', '2'], ['3', '4']] })

    const { content } = parseExcel(buf, 'file-xl', 'Data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    // Each row entry ends with \n, and join('\n') creates \n\n between rows —
    // the chunker treats \n\n+ as a paragraph break and can split here.
    assert.equal(content.includes('\n\n'), true)
  })

  it('parseExcel produces no key:value pairs for a header-only sheet', () => {
    const buf = makeXlsxBuffer({ Empty: [['Header1', 'Header2']] }) // header only, no data

    const { content } = parseExcel(buf, 'file-xl', 'Empty.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    // No data rows → no "Header1: value" style lines
    assert.equal(content.match(/Header1:/), null)
    assert.equal(content.match(/Header2:/), null)
  })
})
