import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGoogleDoc } from '@/lib/file-parsers/google-doc'
import { parseGoogleSheet } from '@/lib/file-parsers/google-sheet'
import { parsePlainText } from '@/lib/file-parsers/plain-text'

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
})
