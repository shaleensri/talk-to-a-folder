/**
 * Shared helpers for integration tests.
 *
 * Integration tests use a real SQLite file (prisma/test.db) and real Prisma
 * queries. Only external network calls (OpenAI, Google Drive) are mocked.
 *
 * Call injectTestPrisma() at the TOP of each integration test file, before
 * requiring any app services, so the injected client propagates through the
 * full require chain.
 */

import { PrismaClient } from '@prisma/client'
import path from 'path' // eslint-disable-line @typescript-eslint/no-unused-vars

// Set before any PrismaClient is instantiated so both testPrisma and the
// injected app singleton resolve to the same file as `prisma db push`.
process.env.DATABASE_URL = 'file:./prisma/test.db'

// Dedicated client for seeding/teardown — never the app singleton
export const testPrisma = new PrismaClient()

/**
 * Patch the require cache so that all subsequently required app modules that
 * import @/lib/prisma receive testPrisma instead of the real singleton.
 * Clears cached service/vector-store modules so they reload fresh.
 */
export function injectTestPrisma(): void {
  const sep = path.sep

  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${sep}src${sep}services${sep}`) ||
      key.includes(`${sep}src${sep}lib${sep}vector-store`) ||
      key.includes(`${sep}src${sep}lib${sep}prisma`)
    ) {
      delete require.cache[key]
    }
  }

  const prismaPath = require.resolve('@/lib/prisma')
  ;(require.cache as Record<string, unknown>)[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: testPrisma },
  }
}

/** Delete all rows in FK-safe order. Call in beforeEach. */
export async function clearDatabase(): Promise<void> {
  await testPrisma.chatMessage.deleteMany()
  await testPrisma.chatSessionFolder.deleteMany()
  await testPrisma.chatSession.deleteMany()
  await testPrisma.textChunk.deleteMany()
  await testPrisma.driveFile.deleteMany()
  await testPrisma.indexedFolder.deleteMany()
  await testPrisma.account.deleteMany()
  await testPrisma.session.deleteMany()
  await testPrisma.verificationToken.deleteMany()
  await testPrisma.user.deleteMany()
}

export async function seedUser(id = 'user-1') {
  return testPrisma.user.create({
    data: { id, email: `${id}@test.local`, name: 'Test User' },
  })
}

export async function seedFolder(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const id = overrides.id as string ?? `folder-${userId}-${Date.now()}`
  return testPrisma.indexedFolder.create({
    data: {
      id,
      userId,
      name: 'Test Folder',
      driveUrl: 'https://drive.google.com/drive/folders/drive-abc',
      folderId: 'drive-abc',
      status: 'indexed',
      fileCount: 0,
      chunkCount: 0,
      ...overrides,
    },
  })
}

export async function seedFile(
  folderId: string,
  overrides: Record<string, unknown> = {},
) {
  const id = overrides.id as string ?? `file-${folderId}-${Date.now()}`
  return testPrisma.driveFile.create({
    data: {
      id,
      folderId,
      driveFileId: `drive-${id}`,
      name: 'test.txt',
      mimeType: 'text/plain',
      status: 'indexed',
      ...overrides,
    },
  })
}
