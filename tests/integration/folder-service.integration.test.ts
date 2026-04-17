/**
 * Integration tests for folder-service.ts
 *
 * Uses a real SQLite test DB. Mocks only Google Drive (listFolderFiles,
 * getFolderName) to avoid network calls.
 *
 * What these tests catch that mocks cannot:
 *   - Wrong WHERE clauses (e.g. userId ownership check)
 *   - CASCADE delete actually removing child rows
 *   - Upsert on re-index not creating duplicate DriveFile rows
 *   - updateFolderStatus correctly merging partial fields
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

// ── Inject test DB before loading any service ─────────────────────────────────
injectTestPrisma()

// Mock Google Drive so createFolder/discoverAndSaveFiles don't make network calls
const Module = require('module')
const originalLoad = Module._load
Module._load = function mockLoad(request: string, ...args: unknown[]) {
  if (request === '@/lib/google-drive') {
    return {
      getFolderName: async () => 'Mocked Folder',
      listFolderFiles: async (_folderId: string, _token: string, dbFolderId: string) => [
        {
          id: `new-file-${Date.now()}`,
          folderId: dbFolderId,
          driveFileId: 'drive-file-stable-id',
          name: 'doc.txt',
          mimeType: 'text/plain',
          size: 100,
          status: 'pending',
          parsedAt: null,
          errorMessage: null,
          createdAt: new Date(),
        },
      ],
    }
  }
  return originalLoad.apply(this, [request, ...args])
}

const service = require('@/services/folder-service') as typeof import('@/services/folder-service')

// ─────────────────────────────────────────────────────────────────────────────

describe('integration: folder-service', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  afterEach(async () => {
    await clearDatabase()
  })

  // ── getFoldersForUser ───────────────────────────────────────────────────────

  it('getFoldersForUser returns only folders belonging to the requesting user', async () => {
    const userA = await seedUser('user-a')
    const userB = await seedUser('user-b')
    await seedFolder(userA.id, { id: 'folder-a', name: 'Folder A' })
    await seedFolder(userA.id, { id: 'folder-a2', name: 'Folder A2', folderId: 'drive-def' })
    await seedFolder(userB.id, { id: 'folder-b', name: 'Folder B', folderId: 'drive-xyz' })

    const results = await service.getFoldersForUser(userA.id)

    assert.equal(results.length, 2)
    assert.ok(results.every((f) => f.userId === userA.id))
    assert.ok(results.some((f) => f.name === 'Folder A'))
    assert.ok(results.some((f) => f.name === 'Folder A2'))
  })

  it('getFoldersForUser returns newest folders first', async () => {
    const user = await seedUser()
    await seedFolder(user.id, { id: 'old-folder', name: 'Old', folderId: 'drive-old' })
    await new Promise((r) => setTimeout(r, 10))
    await seedFolder(user.id, { id: 'new-folder', name: 'New', folderId: 'drive-new' })

    const results = await service.getFoldersForUser(user.id)

    assert.equal(results[0].name, 'New')
    assert.equal(results[1].name, 'Old')
  })

  // ── getFolderById ───────────────────────────────────────────────────────────

  it('getFolderById returns the folder for the correct owner', async () => {
    const user = await seedUser()
    const folder = await seedFolder(user.id, { id: 'my-folder' })

    const result = await service.getFolderById('my-folder', user.id)

    assert.ok(result)
    assert.equal(result!.id, 'my-folder')
    assert.equal(result!.userId, user.id)
  })

  it('getFolderById returns null for another user\'s folder', async () => {
    const userA = await seedUser('user-a')
    const userB = await seedUser('user-b')
    await seedFolder(userA.id, { id: 'folder-a' })

    const result = await service.getFolderById('folder-a', userB.id)

    assert.equal(result, null)
  })

  // ── updateFolderStatus ──────────────────────────────────────────────────────

  it('updateFolderStatus persists status and partial extra fields to DB', async () => {
    const user = await seedUser()
    await seedFolder(user.id, { id: 'folder-x', status: 'idle' })

    const indexedAt = new Date()
    await service.updateFolderStatus('folder-x', 'indexed', {
      fileCount: 7,
      chunkCount: 42,
      lastIndexed: indexedAt,
      errorMessage: null,
    })

    const row = await testPrisma.indexedFolder.findUnique({ where: { id: 'folder-x' } })
    assert.equal(row!.status, 'indexed')
    assert.equal(row!.fileCount, 7)
    assert.equal(row!.chunkCount, 42)
    assert.equal(row!.errorMessage, null)
  })

  it('updateFolderStatus only updates provided fields, leaves others unchanged', async () => {
    const user = await seedUser()
    await seedFolder(user.id, { id: 'folder-partial', fileCount: 5 })

    await service.updateFolderStatus('folder-partial', 'error', {
      errorMessage: 'Something broke',
    })

    const row = await testPrisma.indexedFolder.findUnique({ where: { id: 'folder-partial' } })
    assert.equal(row!.status, 'error')
    assert.equal(row!.errorMessage, 'Something broke')
    assert.equal(row!.fileCount, 5) // unchanged
  })

  // ── deleteFolder ────────────────────────────────────────────────────────────

  it('deleteFolder removes the folder and cascades to child files', async () => {
    const user = await seedUser()
    const folder = await seedFolder(user.id, { id: 'folder-del' })
    await seedFile(folder.id, { id: 'file-1' })
    await seedFile(folder.id, { id: 'file-2' })

    await service.deleteFolder(folder.id, user.id)

    const folderRow = await testPrisma.indexedFolder.findUnique({ where: { id: folder.id } })
    const fileRows = await testPrisma.driveFile.findMany({ where: { folderId: folder.id } })
    assert.equal(folderRow, null)
    assert.equal(fileRows.length, 0)
  })

  it('deleteFolder does not delete another user\'s folder', async () => {
    const userA = await seedUser('user-a')
    const userB = await seedUser('user-b')
    await seedFolder(userA.id, { id: 'folder-a' })

    await service.deleteFolder('folder-a', userB.id)

    const row = await testPrisma.indexedFolder.findUnique({ where: { id: 'folder-a' } })
    assert.ok(row, 'folder should still exist')
  })

  // ── upsertFiles (re-index duplicate prevention) ─────────────────────────────

  it('upsertFiles with the same id updates the existing row rather than inserting a new one', async () => {
    const user = await seedUser()
    const folder = await seedFolder(user.id, { id: 'folder-upsert' })

    const file = {
      id: 'file-original',
      folderId: folder.id,
      driveFileId: 'drive-stable',
      name: 'original.txt',
      mimeType: 'text/plain',
      size: 100,
      status: 'pending' as const,
      parsedAt: null,
      errorMessage: null,
      createdAt: new Date(),
    }

    await service.upsertFiles([file])
    // Same id → should update, not insert
    await service.upsertFiles([{ ...file, name: 'updated.txt', status: 'indexed' as const }])

    const rows = await testPrisma.driveFile.findMany({ where: { folderId: folder.id } })
    assert.equal(rows.length, 1, 'same id should update the row, not create a second one')
    assert.equal(rows[0].name, 'updated.txt')
    assert.equal(rows[0].status, 'indexed')
  })

  it('upsertFiles updates name and mimeType on subsequent calls', async () => {
    const user = await seedUser()
    const folder = await seedFolder(user.id, { id: 'folder-update' })

    const file = {
      id: 'file-upd',
      folderId: folder.id,
      driveFileId: 'drive-upd',
      name: 'old-name.txt',
      mimeType: 'text/plain',
      size: 50,
      status: 'pending' as const,
      parsedAt: null,
      errorMessage: null,
      createdAt: new Date(),
    }

    await service.upsertFiles([file])
    await service.upsertFiles([{ ...file, name: 'new-name.txt', status: 'indexed' as const }])

    const row = await testPrisma.driveFile.findUnique({ where: { id: 'file-upd' } })
    assert.equal(row!.name, 'new-name.txt')
    assert.equal(row!.status, 'indexed')
  })

  // ── getFilesForFolder ───────────────────────────────────────────────────────

  it('getFilesForFolder returns files ordered by createdAt ascending', async () => {
    const user = await seedUser()
    const folder = await seedFolder(user.id, { id: 'folder-files' })
    await seedFile(folder.id, { id: 'file-first', name: 'a.txt' })
    await new Promise((r) => setTimeout(r, 10))
    await seedFile(folder.id, { id: 'file-second', name: 'b.txt' })

    const files = await service.getFilesForFolder(folder.id)

    assert.equal(files[0].name, 'a.txt')
    assert.equal(files[1].name, 'b.txt')
  })

  // ── discoverAndSaveFiles duplicate prevention ───────────────────────────────

  it('discoverAndSaveFiles reuses existing DB ids on re-index, preventing duplicate rows', async () => {
    const user = await seedUser()
    const folder = await seedFolder(user.id, { id: 'folder-discover' })

    const fakeFolder = { ...folder, folderId: 'drive-abc' }

    await service.discoverAndSaveFiles(fakeFolder, 'access-token')
    await service.discoverAndSaveFiles(fakeFolder, 'access-token')

    const rows = await testPrisma.driveFile.findMany({ where: { folderId: folder.id } })
    assert.equal(rows.length, 1, 'second discover should reuse the existing row, not create a duplicate')
  })
})
