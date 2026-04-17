import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chunkText } from '@/lib/chunker'

describe('chunkText', () => {
  it('returns no chunks for blank content', () => {
    assert.deepEqual(chunkText('  \n\n  ', 'file-1', 'folder-1'), [])
  })

  it('keeps small documents as one chunk with metadata', () => {
    const chunks = chunkText('Intro paragraph.\n\nSecond paragraph.', 'file-1', 'folder-1', {
      chunkSize: 100,
      overlap: 10,
    })

    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].fileId, 'file-1')
    assert.equal(chunks[0].folderId, 'folder-1')
    assert.equal(chunks[0].chunkIndex, 0)
    assert.equal(chunks[0].text, 'Intro paragraph.\n\nSecond paragraph.')
  })

  it('splits larger documents and includes overlap between chunks', () => {
    const text = [
      'First paragraph is compact.',
      'Second paragraph carries enough detail to cross the configured chunk size.',
      'Third paragraph should appear after an overlap.',
    ].join('\n\n')

    const chunks = chunkText(text, 'file-1', 'folder-1', {
      chunkSize: 80,
      overlap: 12,
    })

    assert.equal(chunks.length > 1, true)
    chunks.forEach((chunk, index) => {
      assert.equal(chunk.chunkIndex, index)
      assert.equal(chunk.fileId, 'file-1')
      assert.equal(chunk.folderId, 'folder-1')
    })
    assert.equal(chunks[1].text.startsWith(chunks[0].text.slice(-12)), true)
  })
})
