import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

const pdfFile = {
  driveFileId: 'drive-pdf-1',
  name: 'Report.pdf',
}

function loadRoute(options: {
  session?: { user?: { id?: string } } | null
  file?: typeof pdfFile | null
  pdfBuffer?: Buffer
  accessTokenError?: Error
} = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve('@/app/api/files/[fileId]/preview/raw/route')
  delete require.cache[routePath]

  const session = options.session === undefined ? { user: { id: 'user-1' } } : options.session
  const file = options.file === undefined ? pdfFile : options.file

  Module._load = function mockLoad(request: string) {
    if (request === 'next-auth') {
      return { getServerSession: async () => session }
    }

    if (request === '@/lib/auth') {
      return { authOptions: {} }
    }

    if (request === '@/lib/prisma') {
      return {
        prisma: {
          driveFile: {
            findFirst: async () => file,
          },
        },
      }
    }

    if (request === '@/lib/google-auth') {
      return {
        getValidAccessToken: async () => {
          if (options.accessTokenError) throw options.accessTokenError
          return 'access-token'
        },
      }
    }

    if (request === '@/lib/google-drive') {
      return {
        downloadFile: async () =>
          options.pdfBuffer ?? Buffer.from('%PDF-1.4 fake pdf content'),
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return { route: require('@/app/api/files/[fileId]/preview/raw/route') }
  } finally {
    Module._load = originalLoad
  }
}

describe('functional: GET /api/files/[fileId]/preview/raw', () => {
  const params = { params: { fileId: 'file-pdf-1' } }

  it('returns 401 when unauthenticated', async () => {
    const { route } = loadRoute({ session: null })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 401)
    assert.equal(await response.text(), 'Unauthorized')
  })

  it('returns 404 when the file is not found or not owned by the user', async () => {
    const { route } = loadRoute({ file: null })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 404)
    assert.equal(await response.text(), 'Not found')
  })

  it('returns 401 when the access token cannot be fetched', async () => {
    const { route } = loadRoute({ accessTokenError: new Error('expired') })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 401)
  })

  it('streams PDF bytes with application/pdf content-type', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 test content bytes')
    const { route } = loadRoute({ pdfBuffer })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'application/pdf')
  })

  it('sets Content-Length matching the buffer size', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 exactly this many bytes')
    const { route } = loadRoute({ pdfBuffer })

    const response = await route.GET({} as never, params)

    assert.equal(response.headers.get('Content-Length'), String(pdfBuffer.length))
  })

  it('sets Content-Disposition inline with the file name', async () => {
    const { route } = loadRoute()

    const response = await route.GET({} as never, params)

    const disposition = response.headers.get('Content-Disposition') ?? ''
    assert.match(disposition, /inline/)
    assert.match(disposition, /Report\.pdf/)
  })

  it('sets Cache-Control for private short-term caching', async () => {
    const { route } = loadRoute()

    const response = await route.GET({} as never, params)

    const cacheControl = response.headers.get('Cache-Control') ?? ''
    assert.match(cacheControl, /private/)
  })
})
