import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { embeddings } from '@/lib/embeddings'
import { retrieve } from '@/lib/retrieval'
import { vectorStore } from '@/lib/vector-store'
import type { VectorMatch } from '@/types'

const originalEmbed = embeddings.embed.bind(embeddings)
const originalQuery = vectorStore.query.bind(vectorStore)

function makeMatch(id: string, score: number, fileId: string): VectorMatch {
  return {
    id,
    score,
    metadata: {
      folderId: 'folder-1',
      fileId,
      fileName: `${fileId}.txt`,
      text: `Chunk text for ${id}`,
      chunkIndex: 0,
    },
  }
}

describe('functional: retrieval pipeline', () => {
  afterEach(() => {
    embeddings.embed = originalEmbed
    vectorStore.query = originalQuery
  })

  it('embeds the query, searches the requested folder, and selects relevant chunks', async () => {
    embeddings.embed = async (text: string) => {
      assert.equal(text, 'What changed?')
      return [1, 0, 0]
    }

    vectorStore.query = async (embedding, topK, filter) => {
      assert.deepEqual(embedding, [1, 0, 0])
      assert.equal(topK, 8)
      assert.deepEqual(filter, { folderId: 'folder-1' })
      return [
        makeMatch('chunk-1', 0.8, 'file-a'),
        makeMatch('chunk-2', 0.7, 'file-a'),
        makeMatch('chunk-3', 0.4, 'file-b'),
      ]
    }

    const result = await retrieve('What changed?', 'folder-1')

    assert.equal(result.isSupported, true)
    assert.deepEqual(result.selectedChunks.map((chunk) => chunk.chunkId), [
      'chunk-1',
      'chunk-2',
      'chunk-3',
    ])
    assert.deepEqual(result.debugInfo.selectedChunkIds, ['chunk-1', 'chunk-2', 'chunk-3'])
    assert.equal(result.debugInfo.totalRetrieved, 3)
    assert.equal(result.debugInfo.totalSelected, 3)
  })

  it('uses spread selection for broad low-score queries', async () => {
    embeddings.embed = async () => [0.1, 0.2]
    vectorStore.query = async () => [
      makeMatch('chunk-a1', 0.25, 'file-a'),
      makeMatch('chunk-a2', 0.24, 'file-a'),
      makeMatch('chunk-b1', 0.23, 'file-b'),
      makeMatch('chunk-c1', 0.22, 'file-c'),
    ]

    const result = await retrieve('Give me an overview', 'folder-1')

    assert.deepEqual(result.selectedChunks.map((chunk) => chunk.chunkId), [
      'chunk-a1',
      'chunk-b1',
      'chunk-c1',
    ])
    assert.equal(new Set(result.selectedChunks.map((chunk) => chunk.fileId)).size, 3)
  })
})
