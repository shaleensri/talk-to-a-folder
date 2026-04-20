import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

const Module = require('module')

const baseFolder = {
  id: 'folder-1',
  name: 'Folder',
  driveUrl: 'https://drive.google.com/drive/folders/folder-1',
  folderId: 'drive-folder-1',
  status: 'idle',
  fileCount: 0,
  chunkCount: 0,
  lastIndexed: null,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

function makeFile(id: string, name: string) {
  return {
    id,
    folderId: 'folder-1',
    driveFileId: `drive-${id}`,
    name,
    mimeType: 'text/plain',
    size: 100,
    status: 'pending' as const,
    parsedAt: null,
  }
}

interface IngestionHarnessOptions {
  files?: Array<ReturnType<typeof makeFile>>
  parseFile?: (file: ReturnType<typeof makeFile>, accessToken: string) => Promise<{ content: string }>
  chunkText?: (content: string, fileId: string, folderId: string) => Array<{
    id: string
    fileId: string
    folderId: string
    text: string
    chunkIndex: number
    startChar: number
    endChar: number
  }>
  discoverError?: Error
}

function loadIngestionService(options: IngestionHarnessOptions = {}) {
  const originalLoad = Module._load
  const servicePath = require.resolve('@/services/ingestion-service')
  delete require.cache[servicePath]

  const files = options.files ?? [makeFile('file-1', 'Doc.txt')]
  const calls = {
    updateFolderStatus: [] as Array<{ folderId: string; status: string; extra?: unknown }>,
    updateFileStatus: [] as Array<{ fileId: string; status: string; extra?: unknown }>,
    discoverAndSaveFiles: [] as Array<{ folderId: string; accessToken: string }>,
    deleteByFolder: [] as string[],
    parseFile: [] as Array<{ fileId: string; accessToken: string }>,
    embedBatch: [] as string[][],
    upsert: [] as unknown[][],
  }

  let storedProgressJson: string | null = null

  const parseFile = options.parseFile ?? (async () => ({ content: 'Parsed content' }))
  const chunkText = options.chunkText ?? ((content: string, fileId: string, folderId: string) => [
    {
      id: `${fileId}-chunk-1`,
      fileId,
      folderId,
      text: content,
      chunkIndex: 0,
      startChar: 0,
      endChar: content.length,
    },
  ])

  Module._load = function mockLoad(request: string) {
    if (request === 'openai') {
      class MockOpenAI {
        chat = {
          completions: {
            create: async () => ({
              choices: [{ message: { content: 'A short summary.' } }],
            }),
          },
        }
      }
      return MockOpenAI
    }

    if (request === '@/lib/file-parsers') {
      return {
        parseFile: async (file: ReturnType<typeof makeFile>, accessToken: string) => {
          calls.parseFile.push({ fileId: file.id, accessToken })
          return parseFile(file, accessToken)
        },
      }
    }

    if (request === '@/lib/chunker') {
      return { chunkText }
    }

    if (request === '@/lib/embeddings') {
      return {
        embeddings: {
          embedBatch: async (texts: string[]) => {
            calls.embedBatch.push(texts)
            return texts.map((_, index) => [index, index + 1])
          },
        },
      }
    }

    if (request === '@/lib/vector-store') {
      return {
        vectorStore: {
          deleteByFolder: async (folderId: string) => {
            calls.deleteByFolder.push(folderId)
          },
          upsert: async (records: unknown[]) => {
            calls.upsert.push(records)
          },
        },
      }
    }

    if (request === './folder-service') {
      return {
        updateFolderStatus: async (folderId: string, status: string, extra?: unknown) => {
          calls.updateFolderStatus.push({ folderId, status, extra })
        },
        updateFileStatus: async (fileId: string, status: string, extra?: unknown) => {
          calls.updateFileStatus.push({ fileId, status, extra })
        },
        discoverAndSaveFiles: async (folder: typeof baseFolder, accessToken: string) => {
          calls.discoverAndSaveFiles.push({ folderId: folder.id, accessToken })
          if (options.discoverError) throw options.discoverError
          return files
        },
      }
    }

    if (request === '@/lib/prisma') {
      return {
        prisma: {
          driveFile: {
            update: async () => {},
          },
          indexedFolder: {
            update: async (args: { data?: { progressJson?: string } }) => {
              if (args.data?.progressJson != null) storedProgressJson = args.data.progressJson
            },
            findUnique: async () =>
              storedProgressJson != null ? { progressJson: storedProgressJson } : null,
          },
        },
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      service: require('@/services/ingestion-service') as typeof import('@/services/ingestion-service'),
      calls,
    }
  } finally {
    Module._load = originalLoad
  }
}

describe('functional: ingestion service', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = () => {}
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('indexes parseable files and records skipped/error files without aborting ingestion', async () => {
    const files = [
      makeFile('file-indexed', 'Indexed.txt'),
      makeFile('file-empty', 'Empty.txt'),
      makeFile('file-error', 'Broken.txt'),
    ]

    const { service, calls } = loadIngestionService({
      files,
      parseFile: async (file) => {
        if (file.id === 'file-empty') return { content: '   ' }
        if (file.id === 'file-error') throw new Error('Parser exploded')
        return { content: 'Alpha\n\nBeta' }
      },
      chunkText: (content, fileId, folderId) => [
        {
          id: `${fileId}-chunk-1`,
          fileId,
          folderId,
          text: content,
          chunkIndex: 0,
          startChar: 0,
          endChar: 5,
        },
        {
          id: `${fileId}-chunk-2`,
          fileId,
          folderId,
          text: 'Beta',
          chunkIndex: 1,
          startChar: 7,
          endChar: 11,
        },
      ],
    })

    await service.ingestFolder(baseFolder, 'access-token')

    assert.deepEqual(calls.discoverAndSaveFiles, [
      { folderId: 'folder-1', accessToken: 'access-token' },
    ])
    assert.deepEqual(calls.deleteByFolder, ['folder-1'])
    assert.equal(calls.upsert.length, 1)
    assert.equal(calls.upsert[0].length, 2)
    assert.deepEqual(calls.embedBatch, [['Alpha\n\nBeta', 'Beta']])

    assert.deepEqual(
      calls.updateFileStatus.map((call) => [call.fileId, call.status]),
      [
        ['file-indexed', 'parsing'],
        ['file-indexed', 'indexed'],
        ['file-empty', 'parsing'],
        ['file-empty', 'skipped'],
        ['file-error', 'parsing'],
        ['file-error', 'error'],
      ],
    )

    const finalFolderUpdate = calls.updateFolderStatus.at(-1)
    assert.equal(finalFolderUpdate?.status, 'indexed')
    assert.deepEqual(finalFolderUpdate?.extra, {
      fileCount: 1,
      chunkCount: 2,
      lastIndexed: (finalFolderUpdate?.extra as { lastIndexed: Date }).lastIndexed,
      errorMessage: null,
    })
    assert.equal((finalFolderUpdate?.extra as { lastIndexed: Date }).lastIndexed instanceof Date, true)

    // Allow fire-and-forget setProgress promises to settle
    await new Promise((r) => setTimeout(r, 0))

    assert.deepEqual(await service.getIngestionProgress('folder-1'), {
      folderId: 'folder-1',
      status: 'indexed',
      progress: {
        total: 3,
        parsed: 1,
        indexed: 1,
        failed: 1,
        skipped: 1,
      },
    })
  })

  it('marks the folder as error when discovery fails', async () => {
    const { service, calls } = loadIngestionService({
      discoverError: new Error('404 not found'),
    })

    await service.ingestFolder(baseFolder, 'access-token')

    const finalFolderUpdate = calls.updateFolderStatus.at(-1)
    assert.equal(finalFolderUpdate?.status, 'error')
    assert.deepEqual(finalFolderUpdate?.extra, {
      errorMessage: 'Folder not found on Google Drive. It may have been deleted or moved. You can remove it here.',
    })
    // Allow fire-and-forget setProgress promises to settle
    await new Promise((r) => setTimeout(r, 0))

    const progress = await service.getIngestionProgress('folder-1')
    assert.equal(progress?.status, 'error')
    assert.equal(
      progress?.errorMessage,
      'Folder not found on Google Drive. It may have been deleted or moved. You can remove it here.',
    )
  })
})
