import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

const folder = {
  id: 'folder-1',
  name: 'My Folder',
  driveUrl: 'https://drive.google.com/drive/folders/drive-folder-1',
  folderId: 'drive-folder-1',
  status: 'indexed',
  fileCount: 2,
  chunkCount: 5,
  lastIndexed: null,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const files = [
  {
    id: 'file-1',
    folderId: 'folder-1',
    driveFileId: 'drive-file-1',
    name: 'Doc.txt',
    mimeType: 'text/plain',
    size: 100,
    status: 'indexed',
    parsedAt: null,
  },
]

function makeRequest(body: unknown) {
  return { json: async () => body }
}

function makeInvalidJsonRequest() {
  return {
    json: async () => { throw new Error('invalid json') },
  }
}

interface HarnessOptions {
  session?: { user?: { id?: string } } | null
  folders?: unknown[]
  folder?: typeof folder | null
  accessTokenError?: Error
  liveProgress?: unknown
}

function loadRoute(routeAlias: string, options: HarnessOptions = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve(routeAlias)
  delete require.cache[routePath]

  const calls = {
    createFolder: [] as Array<{ driveUrl: string; userId: string; accessToken: string }>,
    deleteFolder: [] as Array<{ folderId: string; userId: string }>,
    getFolderById: [] as Array<{ folderId: string; userId: string }>,
    getFoldersForUser: [] as string[],
    getFilesForFolder: [] as string[],
    getValidAccessToken: [] as string[],
    ingestFolder: [] as Array<{ folderId: string; accessToken: string }>,
  }

  const session = options.session === undefined
    ? { user: { id: 'user-1' } }
    : options.session

  Module._load = function mockLoad(request: string) {
    if (request === 'next-auth') {
      return { getServerSession: async () => session }
    }

    if (request === '@/lib/auth') {
      return { authOptions: {} }
    }

    if (request === '@/lib/google-auth') {
      return {
        getValidAccessToken: async (userId: string) => {
          calls.getValidAccessToken.push(userId)
          if (options.accessTokenError) throw options.accessTokenError
          return 'access-token'
        },
      }
    }

    if (request === '@/services/folder-service') {
      return {
        getFoldersForUser: async (userId: string) => {
          calls.getFoldersForUser.push(userId)
          return options.folders ?? [folder]
        },
        createFolder: async (driveUrl: string, userId: string, accessToken: string) => {
          calls.createFolder.push({ driveUrl, userId, accessToken })
          return { ...folder, driveUrl }
        },
        getFolderById: async (folderId: string, userId: string) => {
          calls.getFolderById.push({ folderId, userId })
          return options.folder === undefined ? folder : options.folder
        },
        deleteFolder: async (folderId: string, userId: string) => {
          calls.deleteFolder.push({ folderId, userId })
        },
        getFilesForFolder: async (folderId: string) => {
          calls.getFilesForFolder.push(folderId)
          return files
        },
      }
    }

    if (request === '@/services/ingestion-service') {
      return {
        ingestFolder: async (indexedFolder: typeof folder, accessToken: string) => {
          calls.ingestFolder.push({ folderId: indexedFolder.id, accessToken })
        },
        getIngestionProgress: () => Promise.resolve(options.liveProgress ?? null),
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return { route: require(routeAlias), calls }
  } finally {
    Module._load = originalLoad
  }
}

async function readJson(response: Response) {
  return JSON.parse(await response.text())
}

describe('functional: folder API routes', () => {
  // ---------------------------------------------------------------------------
  // GET /api/folders
  // ---------------------------------------------------------------------------

  it('GET /api/folders returns 401 when unauthenticated', async () => {
    const { route } = loadRoute('@/app/api/folders/route', { session: null })

    const response = await route.GET()

    assert.equal(response.status, 401)
    assert.deepEqual(await readJson(response), { error: 'Unauthorized' })
  })

  it('GET /api/folders returns folders for the authenticated user', async () => {
    const { route, calls } = loadRoute('@/app/api/folders/route')

    const response = await route.GET()

    assert.equal(response.status, 200)
    assert.equal((await readJson(response)).folders[0].id, 'folder-1')
    assert.deepEqual(calls.getFoldersForUser, ['user-1'])
  })

  // ---------------------------------------------------------------------------
  // POST /api/folders — URL path
  // ---------------------------------------------------------------------------

  it('POST /api/folders returns 400 for invalid JSON', async () => {
    const { route } = loadRoute('@/app/api/folders/route')

    const response = await route.POST(makeInvalidJsonRequest() as never)

    assert.equal(response.status, 400)
    assert.deepEqual(await readJson(response), { error: 'Invalid JSON' })
  })

  it('POST /api/folders returns 400 when neither driveUrl nor driveFolderId is provided', async () => {
    const { route } = loadRoute('@/app/api/folders/route')

    const response = await route.POST(makeRequest({}) as never)

    assert.equal(response.status, 400)
    assert.match((await readJson(response)).error, /driveUrl or driveFolderId is required/)
  })

  it('POST /api/folders returns 400 when driveUrl is blank', async () => {
    const { route } = loadRoute('@/app/api/folders/route')

    const response = await route.POST(makeRequest({ driveUrl: '   ' }) as never)

    assert.equal(response.status, 400)
    assert.match((await readJson(response)).error, /driveUrl or driveFolderId is required/)
  })

  it('POST /api/folders creates a folder via driveUrl and starts ingestion', async () => {
    const { route, calls } = loadRoute('@/app/api/folders/route')

    const response = await route.POST(
      makeRequest({ driveUrl: '  https://drive.google.com/drive/folders/drive-folder-1  ' }) as never,
    )

    assert.equal(response.status, 201)
    assert.equal((await readJson(response)).folder.id, 'folder-1')
    assert.deepEqual(calls.getValidAccessToken, ['user-1'])
    assert.equal(calls.createFolder[0].driveUrl, 'https://drive.google.com/drive/folders/drive-folder-1')
    assert.deepEqual(calls.ingestFolder, [{ folderId: 'folder-1', accessToken: 'access-token' }])
  })

  // ---------------------------------------------------------------------------
  // POST /api/folders — driveFolderId path (new Drive folder picker)
  // ---------------------------------------------------------------------------

  it('POST /api/folders creates a folder via driveFolderId and starts ingestion', async () => {
    const { route, calls } = loadRoute('@/app/api/folders/route')

    const response = await route.POST(
      makeRequest({ driveFolderId: 'drive-folder-1' }) as never,
    )

    assert.equal(response.status, 201)
    // The route should have constructed a Drive URL from the ID
    assert.ok(calls.createFolder[0].driveUrl.includes('drive-folder-1'))
    assert.deepEqual(calls.ingestFolder, [{ folderId: 'folder-1', accessToken: 'access-token' }])
  })

  // ---------------------------------------------------------------------------
  // GET/DELETE /api/folders/[folderId]
  // ---------------------------------------------------------------------------

  it('GET /api/folders/[folderId] returns 404 for folders not owned by the user', async () => {
    const { route } = loadRoute('@/app/api/folders/[folderId]/route', { folder: null })

    const response = await route.GET({} as never, { params: { folderId: 'missing' } })

    assert.equal(response.status, 404)
    assert.deepEqual(await readJson(response), { error: 'Not found' })
  })

  it('DELETE /api/folders/[folderId] removes the folder and returns 204', async () => {
    const { route, calls } = loadRoute('@/app/api/folders/[folderId]/route')

    const response = await route.DELETE({} as never, { params: { folderId: 'folder-1' } })

    assert.equal(response.status, 204)
    assert.deepEqual(calls.deleteFolder, [{ folderId: 'folder-1', userId: 'user-1' }])
  })

  // ---------------------------------------------------------------------------
  // Status / files / ingest sub-routes
  // ---------------------------------------------------------------------------

  it('GET /api/folders/[folderId]/status returns live progress when available', async () => {
    const liveProgress = {
      folderId: 'folder-1',
      status: 'ingesting',
      progress: { total: 5, parsed: 2, indexed: 1, failed: 0, skipped: 0 },
      currentFile: 'Report.pdf',
    }
    const { route } = loadRoute('@/app/api/folders/[folderId]/status/route', { liveProgress })

    const response = await route.GET({} as never, { params: { folderId: 'folder-1' } })

    assert.equal(response.status, 200)
    assert.deepEqual(await readJson(response), { status: liveProgress })
  })

  it('GET /api/folders/[folderId]/files returns files after ownership check', async () => {
    const { route, calls } = loadRoute('@/app/api/folders/[folderId]/files/route')

    const response = await route.GET({} as never, { params: { folderId: 'folder-1' } })

    assert.equal(response.status, 200)
    assert.equal((await readJson(response)).files[0].id, 'file-1')
    assert.deepEqual(calls.getFolderById, [{ folderId: 'folder-1', userId: 'user-1' }])
    assert.deepEqual(calls.getFilesForFolder, ['folder-1'])
  })

  it('POST /api/folders/[folderId]/ingest starts ingestion and returns 202', async () => {
    const { route, calls } = loadRoute('@/app/api/folders/[folderId]/ingest/route')

    const response = await route.POST({} as never, { params: { folderId: 'folder-1' } })

    assert.equal(response.status, 202)
    assert.deepEqual(await readJson(response), { message: 'Ingestion started' })
    assert.deepEqual(calls.getValidAccessToken, ['user-1'])
    assert.deepEqual(calls.ingestFolder, [{ folderId: 'folder-1', accessToken: 'access-token' }])
  })
})
