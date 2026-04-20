import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chunkText } from '@/lib/chunker'

describe('chunkText', () => {
  it('returns no chunks for blank content', () => {
    assert.deepEqual(chunkText('  \n\n  ', 'file-1', 'folder-1'), [])
  })

  it('keeps small documents as one chunk with correct metadata', () => {
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

  it('assigns sequential chunkIndex values starting at 0', () => {
    const text = 'A'.repeat(50) + '\n\n' + 'B'.repeat(50) + '\n\n' + 'C'.repeat(50)
    const chunks = chunkText(text, 'f', 'folder', { chunkSize: 55, overlap: 0 })

    chunks.forEach((chunk, i) => {
      assert.equal(chunk.chunkIndex, i)
    })
  })

  it('hard-splits a segment that has no sentence boundaries and exceeds chunkSize', () => {
    // A single paragraph with no punctuation — no sentence split possible.
    // It must be hard-split rather than left as one oversized chunk.
    const longRow = 'word '.repeat(200).trim() // ~995 chars, no punctuation

    const chunks = chunkText(longRow, 'file-xl', 'folder-1', { chunkSize: 200, overlap: 0 })

    // Every chunk must be at most chunkSize characters
    for (const chunk of chunks) {
      assert.equal(chunk.text.length <= 200, true, `chunk too large: ${chunk.text.length}`)
    }
    // Content is fully preserved across all chunks
    const reconstructed = chunks.map((c) => c.text).join('')
    assert.equal(reconstructed.replace(/\s+/g, ' ').trim(), longRow.replace(/\s+/g, ' ').trim())
  })

  it('hard-splits a pathological input into multiple chunks and preserves all content', () => {
    // Simulate a single gigantic Excel row with no whitespace or sentence boundaries.
    // The hard-split pass guarantees no single segment exceeds chunkSize before merging.
    // After overlap is applied during merging, buffers may slightly exceed chunkSize —
    // this is expected. The important property is that content is not lost and
    // the document is split into multiple chunks rather than one oversized block.
    const blob = 'X'.repeat(10_000)
    const chunks = chunkText(blob, 'file-1', 'folder-1', { chunkSize: 1800, overlap: 0 })

    // Must produce multiple chunks (not a single 10k-char chunk)
    assert.equal(chunks.length > 1, true)

    // With overlap=0, no chunk should exceed chunkSize
    for (const chunk of chunks) {
      assert.equal(chunk.text.length <= 1800, true, `chunk too large: ${chunk.text.length}`)
    }

    // Total content is preserved
    const total = chunks.reduce((sum, c) => sum + c.text.length, 0)
    assert.equal(total, 10_000)
  })
})
