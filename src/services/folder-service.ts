import { prisma } from '@/lib/prisma'
import type { IndexedFolder, DriveFile } from '@/types'
import { extractFolderIdFromUrl, generateId } from '@/lib/utils'
import { getFolderName, listFolderFiles } from '@/lib/google-drive'

// ---------------------------------------------------------------------------
// Folder CRUD
// ---------------------------------------------------------------------------

export async function getFoldersForUser(userId: string): Promise<IndexedFolder[]> {
  const rows = await prisma.indexedFolder.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return rows as IndexedFolder[]
}

export async function getFolderById(
  folderId: string,
  userId: string,
): Promise<IndexedFolder | null> {
  const row = await prisma.indexedFolder.findFirst({
    where: { id: folderId, userId },
  })
  return row as IndexedFolder | null
}

export async function createFolder(
  driveUrl: string,
  userId: string,
  accessToken: string,
): Promise<IndexedFolder> {
  const driveFolderId = extractFolderIdFromUrl(driveUrl)
  if (!driveFolderId) {
    throw new Error('Invalid Google Drive folder URL')
  }

  // Check for duplicate
  const existing = await prisma.indexedFolder.findFirst({
    where: { folderId: driveFolderId, userId },
  })
  if (existing) {
    throw new Error('This folder has already been added')
  }

  // Fetch folder name from Drive API
  const name = await getFolderName(driveFolderId, accessToken)

  const folder = await prisma.indexedFolder.create({
    data: {
      id: generateId(),
      name,
      driveUrl,
      folderId: driveFolderId,
      status: 'idle',
      fileCount: 0,
      chunkCount: 0,
      userId,
    },
  })

  return folder as IndexedFolder
}

export async function deleteFolder(folderId: string, userId: string): Promise<void> {
  await prisma.indexedFolder.deleteMany({
    where: { id: folderId, userId },
  })
}

export async function updateFolderStatus(
  folderId: string,
  status: string,
  extra?: {
    fileCount?: number
    chunkCount?: number
    lastIndexed?: Date
    errorMessage?: string | null
  },
): Promise<void> {
  await prisma.indexedFolder.update({
    where: { id: folderId },
    data: {
      status,
      ...(extra?.fileCount !== undefined && { fileCount: extra.fileCount }),
      ...(extra?.chunkCount !== undefined && { chunkCount: extra.chunkCount }),
      ...(extra?.lastIndexed !== undefined && { lastIndexed: extra.lastIndexed }),
      ...(extra?.errorMessage !== undefined && { errorMessage: extra.errorMessage }),
    },
  })
}

// ---------------------------------------------------------------------------
// File management
// ---------------------------------------------------------------------------

export async function getFilesForFolder(folderId: string): Promise<DriveFile[]> {
  const rows = await prisma.driveFile.findMany({
    where: { folderId },
    orderBy: { createdAt: 'asc' },
  })
  return rows as DriveFile[]
}

export async function upsertFiles(files: DriveFile[]): Promise<void> {
  await prisma.$transaction(
    files.map((f) =>
      prisma.driveFile.upsert({
        where: { id: f.id },
        create: {
          id: f.id,
          folderId: f.folderId,
          driveFileId: f.driveFileId,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          status: f.status,
        },
        update: {
          status: f.status,
        },
      }),
    ),
  )
}

export async function updateFileStatus(
  fileId: string,
  status: string,
  extra?: { errorMessage?: string; parsedAt?: Date },
): Promise<void> {
  await prisma.driveFile.update({
    where: { id: fileId },
    data: {
      status,
      ...(extra?.errorMessage !== undefined && { errorMessage: extra.errorMessage }),
      ...(extra?.parsedAt !== undefined && { parsedAt: extra.parsedAt }),
    },
  })
}

// ---------------------------------------------------------------------------
// Discover files in a Drive folder and save them to DB
// ---------------------------------------------------------------------------

export async function discoverAndSaveFiles(
  folder: IndexedFolder,
  accessToken: string,
): Promise<DriveFile[]> {
  const files = await listFolderFiles(folder.folderId, accessToken, folder.id)
  await upsertFiles(files)
  return files
}
