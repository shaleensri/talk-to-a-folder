/**
 * Integration tests for lib/vector-store.ts (PrismaVectorStore)
 *
 * Uses a real SQLite test DB. No mocks — tests actual cosine similarity math,
 * JSON embedding serialization, folderId filtering, and cascade deletes.
 *
 * What these tests catch that mocks cannot:
 *   - Cosine similarity returning wrong ranking
 *   - JSON.parse failing on stored embeddings
 *   - folderId filter leaking chunks from other folders
 *   - deleteByFolder leaving orphaned rows
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  injectTestPrisma,
  clearDatabase,
  seedUser,
  seedFolder,
  seedFile,
  testPrisma,
} from './setup'

injectTestPrisma()

const { PrismaVectorStore } = require('@/lib/vector-store') as typeof import('@/lib/vector-store')
const store = new PrismaVectorStore()

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a simple 3-d unit vector pointing in direction [x, y, z]. */
function vec(x: number, y: number, z: number): number[] {
  const mag = Math.sqrt(x * x + y * y + z * z)
  return [x / mag, y / mag, z / mag]
}

async function buildFolderWithFile(userId: string, folderId: string, fileName: string) {
  const folder = await seedFolder(userId, { id: folderId, folderId: `drive-${folderId}` })
  const file = await seedFile(folder.id, { id: `file-${folderId}`, name: fileName })
  return { folder, file }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('integration: vector store', () => {
  let userId: string

  beforeEach(async () => {
    await clearDatabase()
    const user = await seedUser('vs-user')
    userId = user.id
  })

  afterEach(async () => {
    await clearDatabase()
  })

  // ── upsert ──────────────────────────────────────────────────────────────────

  it('upsert persists chunks with embeddings as JSON strings in the DB', async () => {
    const { folder, file } = await buildFolderWithFile(userId, 'folder-upsert', 'doc.txt')

    await store.upsert([
      {
        id: 'chunk-1',
        embedding: vec(1, 0, 0),
        metadata: {
          folderId: folder.id,
          fileId: file.id,
          fileName: file.name,
          text: 'Hello world',
          chunkIndex: 0,
        },
      },
    ])

    const row = await testPrisma.textChunk.findUnique({ where: { id: 'chunk-1' } })
    assert.ok(row, 'chunk should be persisted')
    assert.equal(row!.text, 'Hello world')
    assert.equal(row!.folderId, folder.id)

    const parsed = JSON.parse(row!.embedding!)
    assert.equal(Array.isArray(parsed), true)
    assert.equal(parsed.length, 3)
  })

  it('upsert on an existing chunk id updates the embedding, not duplicates', async () => {
    const { folder, file } = await buildFolderWithFile(userId, 'folder-upd', 'doc.txt')

    const record = {
      id: 'chunk-upd',
      embedding: vec(1, 0, 0),
      metadata: {
        folderId: folder.id,
        fileId: file.id,
        fileName: file.name,
        text: 'Original',
        chunkIndex: 0,
      },
    }

    await store.upsert([record])
    await store.upsert([{ ...record, embedding: vec(0, 1, 0) }])

    const rows = await testPrisma.textChunk.findMany({ where: { folderIds: [folder.id] } })
    assert.equal(rows.length, 1, 'should update, not insert a second row')

    const stored = JSON.parse(rows[0].embedding!)
    // Should be the new embedding (pointing in y direction)
    assert.ok(stored[1] > 0.9, 'y component should dominate in updated embedding')
  })

  // ── query — cosine ranking ──────────────────────────────────────────────────

  it('query returns chunks ranked by cosine similarity, highest first', async () => {
    const { folder, file } = await buildFolderWithFile(userId, 'folder-rank', 'doc.txt')

    // chunk-near points same direction as query; chunk-far points opposite
    await store.upsert([
      {
        id: 'chunk-near',
        embedding: vec(1, 0.1, 0),
        metadata: { folderId: folder.id, fileId: file.id, fileName: 'doc.txt', text: 'Near', chunkIndex: 0 },
      },
      {
        id: 'chunk-mid',
        embedding: vec(0.5, 0.5, 0),
        metadata: { folderId: folder.id, fileId: file.id, fileName: 'doc.txt', text: 'Mid', chunkIndex: 1 },
      },
      {
        id: 'chunk-far',
        embedding: vec(-1, 0, 0),
        metadata: { folderId: folder.id, fileId: file.id, fileName: 'doc.txt', text: 'Far', chunkIndex: 2 },
      },
    ])

    const results = await store.query(vec(1, 0, 0), 3, { folderIds: [folder.id] })

    assert.equal(results.length, 3)
    assert.equal(results[0].id, 'chunk-near')
    assert.equal(results[2].id, 'chunk-far')
    assert.ok(results[0].score > results[1].score)
    assert.ok(results[1].score > results[2].score)
  })

  it('query respects topK and returns at most that many results', async () => {
    const { folder, file } = await buildFolderWithFile(userId, 'folder-topk', 'doc.txt')

    await store.upsert(
      Array.from({ length: 5 }, (_, i) => ({
        id: `chunk-tk-${i}`,
        embedding: vec(i + 1, 0, 0),
        metadata: { folderId: folder.id, fileId: file.id, fileName: 'doc.txt', text: `Chunk ${i}`, chunkIndex: i },
      })),
    )

    const results = await store.query(vec(1, 0, 0), 3, { folderIds: [folder.id] })
    assert.equal(results.length, 3)
  })

  // ── query — folderId isolation ──────────────────────────────────────────────

  it('query with folderId filter does not return chunks from other folders', async () => {
    const { folder: folderA, file: fileA } = await buildFolderWithFile(userId, 'folder-a', 'a.txt')
    const { folder: folderB, file: fileB } = await buildFolderWithFile(userId, 'folder-b', 'b.txt')

    await store.upsert([
      {
        id: 'chunk-a',
        embedding: vec(1, 0, 0),
        metadata: { folderId: folderA.id, fileId: fileA.id, fileName: 'a.txt', text: 'In A', chunkIndex: 0 },
      },
      {
        id: 'chunk-b',
        embedding: vec(1, 0, 0),
        metadata: { folderId: folderB.id, fileId: fileB.id, fileName: 'b.txt', text: 'In B', chunkIndex: 0 },
      },
    ])

    const results = await store.query(vec(1, 0, 0), 10, { folderIds: [folderA.id] })

    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'chunk-a')
  })

  it('query without folderId filter returns chunks from all folders', async () => {
    const { folder: folderA, file: fileA } = await buildFolderWithFile(userId, 'folder-all-a', 'a.txt')
    const { folder: folderB, file: fileB } = await buildFolderWithFile(userId, 'folder-all-b', 'b.txt')

    await store.upsert([
      {
        id: 'chunk-all-a',
        embedding: vec(1, 0, 0),
        metadata: { folderId: folderA.id, fileId: fileA.id, fileName: 'a.txt', text: 'A', chunkIndex: 0 },
      },
      {
        id: 'chunk-all-b',
        embedding: vec(1, 0, 0),
        metadata: { folderId: folderB.id, fileId: fileB.id, fileName: 'b.txt', text: 'B', chunkIndex: 0 },
      },
    ])

    const results = await store.query(vec(1, 0, 0), 10)
    assert.equal(results.length, 2)
  })

  // ── deleteByFolder ──────────────────────────────────────────────────────────

  it('deleteByFolder removes all chunks for that folder and leaves other folders untouched', async () => {
    const { folder: folderA, file: fileA } = await buildFolderWithFile(userId, 'folder-del-a', 'a.txt')
    const { folder: folderB, file: fileB } = await buildFolderWithFile(userId, 'folder-del-b', 'b.txt')

    await store.upsert([
      {
        id: 'chunk-del-a1',
        embedding: vec(1, 0, 0),
        metadata: { folderId: folderA.id, fileId: fileA.id, fileName: 'a.txt', text: 'A1', chunkIndex: 0 },
      },
      {
        id: 'chunk-del-a2',
        embedding: vec(0, 1, 0),
        metadata: { folderId: folderA.id, fileId: fileA.id, fileName: 'a.txt', text: 'A2', chunkIndex: 1 },
      },
      {
        id: 'chunk-del-b',
        embedding: vec(0, 0, 1),
        metadata: { folderId: folderB.id, fileId: fileB.id, fileName: 'b.txt', text: 'B', chunkIndex: 0 },
      },
    ])

    await store.deleteByFolder(folderA.id)

    const remaining = await testPrisma.textChunk.findMany()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, 'chunk-del-b')
  })

  // ── metadata shape ──────────────────────────────────────────────────────────

  it('query result metadata includes fileName from the joined DriveFile row', async () => {
    const { folder, file } = await buildFolderWithFile(userId, 'folder-meta', 'important-doc.txt')

    await store.upsert([
      {
        id: 'chunk-meta',
        embedding: vec(1, 0, 0),
        metadata: { folderId: folder.id, fileId: file.id, fileName: 'important-doc.txt', text: 'content', chunkIndex: 0 },
      },
    ])

    const results = await store.query(vec(1, 0, 0), 1, { folderIds: [folder.id] })

    assert.equal(results[0].metadata.fileName, 'important-doc.txt')
    assert.equal(results[0].metadata.fileId, file.id)
    assert.equal(results[0].metadata.folderId, folder.id)
    assert.equal(results[0].metadata.text, 'content')
  })
})
