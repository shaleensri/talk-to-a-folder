import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGoogleDoc } from '@/lib/file-parsers/google-doc'
import { parseGoogleSheet } from '@/lib/file-parsers/google-sheet'
import { parsePlainText } from '@/lib/file-parsers/plain-text'

describe('blackbox: parser public contracts', () => {
  it('returns the common ParsedFile shape for text-like parsers', async () => {
    const results = await Promise.all([
      parseGoogleDoc('Doc body', 'doc-1', 'Doc'),
      parseGoogleSheet('Name\nAcme', 'sheet-1', 'Sheet'),
      parsePlainText('Plain body', 'plain-1', 'Plain', 'text/plain'),
    ])

    for (const parsed of results) {
      assert.equal(typeof parsed.fileId, 'string')
      assert.equal(typeof parsed.fileName, 'string')
      assert.equal(typeof parsed.mimeType, 'string')
      assert.equal(typeof parsed.content, 'string')
    }
  })
})
