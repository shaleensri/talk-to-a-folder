import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clamp,
  extractFolderIdFromUrl,
  formatFileSize,
  formatScore,
  mimeTypeToExtension,
  parseCitationIndices,
  truncate,
} from '@/lib/utils'

describe('utils', () => {
  it('extracts Google Drive folder IDs from common URL formats', () => {
    assert.equal(
      extractFolderIdFromUrl('https://drive.google.com/drive/folders/abc_123-XYZ'),
      'abc_123-XYZ',
    )
    assert.equal(
      extractFolderIdFromUrl('https://drive.google.com/drive/u/0/folders/folder-id_42'),
      'folder-id_42',
    )
    assert.equal(
      extractFolderIdFromUrl('https://drive.google.com/open?id=legacyFolder123'),
      'legacyFolder123',
    )
  })

  it('returns null for invalid Drive folder URLs', () => {
    assert.equal(extractFolderIdFromUrl('https://example.com/not-drive'), null)
    assert.equal(extractFolderIdFromUrl(''), null)
  })

  it('formats common display values', () => {
    assert.equal(formatFileSize(500), '500 B')
    assert.equal(formatFileSize(1536), '1.5 KB')
    assert.equal(formatFileSize(2 * 1024 * 1024), '2.0 MB')
    assert.equal(formatScore(0.876), '88%')
    assert.equal(truncate('abcdef', 4), 'abc…')
    assert.equal(clamp(12, 0, 10), 10)
    assert.equal(clamp(-2, 0, 10), 0)
  })

  it('maps MIME types and parses unique citation indices', () => {
    assert.equal(mimeTypeToExtension('application/pdf'), 'pdf')
    assert.equal(mimeTypeToExtension('application/unknown'), 'file')
    assert.deepEqual(parseCitationIndices('Alpha [2] beta [1][2] gamma [10].'), [1, 2, 10])
  })
})
