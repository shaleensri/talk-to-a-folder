import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

interface DriveFolder { id: string; name: string }

function loadRoute(options: {
  session?: { user?: { id?: string } } | null
  accessTokenError?: Error
  driveError?: Error
  folders?: DriveFolder[]
} = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve('@/app/api/drive/folders/route')
  delete require.cache[routePath]

  const session = options.session === undefined ? { user: { id: 'user-1' } } : options.session
  const folders = options.folders ?? [{ id: 'folder-abc', name: 'My Folder' }]

  const calls = { getValidAccessToken: [] as string[] }

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

    if (request === 'googleapis') {
      return {
        google: {
          auth: {
            OAuth2: class {
              setCredentials() {}
            },
          },
          drive: () => ({
            files: {
              list: async () => {
                if (options.driveError) throw options.driveError
                return { data: { files: folders } }
              },
            },
          }),
        },
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return { route: require('@/app/api/drive/folders/route'), calls }
  } finally {
    Module._load = originalLoad
  }
}

async function readJson(response: Response) {
  return JSON.parse(await response.text())
}

describe('functional: GET /api/drive/folders', () => {
  it('returns 401 when unauthenticated', async () => {
    const { route } = loadRoute({ session: null })

    const response = await route.GET()

    assert.equal(response.status, 401)
    assert.deepEqual(await readJson(response), { error: 'Unauthorized' })
  })

  it('returns 401 when the access token cannot be fetched', async () => {
    const { route } = loadRoute({ accessTokenError: new Error('token expired') })

    const response = await route.GET()

    assert.equal(response.status, 401)
    assert.deepEqual(await readJson(response), { error: 'Failed to get access token' })
  })

  it('returns the list of Drive folders for the authenticated user', async () => {
    const { route } = loadRoute({
      folders: [
        { id: 'folder-1', name: 'Marketing' },
        { id: 'folder-2', name: 'Finance' },
      ],
    })

    const response = await route.GET()

    assert.equal(response.status, 200)
    const json = await readJson(response)
    assert.deepEqual(json.folders, [
      { id: 'folder-1', name: 'Marketing' },
      { id: 'folder-2', name: 'Finance' },
    ])
  })

  it('returns an empty list when the Drive has no folders', async () => {
    const { route } = loadRoute({ folders: [] })

    const response = await route.GET()

    assert.equal(response.status, 200)
    assert.deepEqual((await readJson(response)).folders, [])
  })

  it('returns 500 when the Drive API throws', async () => {
    const { route } = loadRoute({ driveError: new Error('Drive quota exceeded') })

    const response = await route.GET()

    assert.equal(response.status, 500)
    assert.match((await readJson(response)).error, /Drive quota exceeded/)
  })

  it('passes the authenticated user id to getValidAccessToken', async () => {
    const { route, calls } = loadRoute()

    await route.GET()

    assert.deepEqual(calls.getValidAccessToken, ['user-1'])
  })
})
