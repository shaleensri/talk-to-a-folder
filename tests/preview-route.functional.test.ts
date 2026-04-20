import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'

const Module = require('module')

// ---------------------------------------------------------------------------
// Helper — build a real in-memory XLSX buffer
// ---------------------------------------------------------------------------

function makeXlsxBuffer(sheetsData: Record<string, string[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheetsData)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const baseFile = {
  id: 'file-1',
  driveFileId: 'drive-file-1',
  mimeType: 'text/plain' as string,
  name: 'Doc.txt',
}

function loadRoute(options: {
  session?: { user?: { id?: string } } | null
  file?: typeof baseFile | null
  downloadBuffer?: Buffer
  exportContent?: string
  accessTokenError?: Error
  mammothHtml?: string
} = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve('@/app/api/files/[fileId]/preview/route')
  delete require.cache[routePath]

  const session = options.session === undefined ? { user: { id: 'user-1' } } : options.session
  const file = options.file === undefined ? baseFile : options.file

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
        downloadFile: async () => options.downloadBuffer ?? Buffer.from('content'),
        exportGoogleFile: async () => options.exportContent ?? 'exported',
      }
    }

    if (request === 'mammoth') {
      return {
        convertToHtml: async () => ({ value: options.mammothHtml ?? '<p>Hello</p>' }),
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return { route: require('@/app/api/files/[fileId]/preview/route') }
  } finally {
    Module._load = originalLoad
  }
}

async function readJson(response: Response) {
  return JSON.parse(await response.text())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('functional: GET /api/files/[fileId]/preview', () => {
  const params = { params: { fileId: 'file-1' } }

  it('returns 401 when unauthenticated', async () => {
    const { route } = loadRoute({ session: null })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 401)
  })

  it('returns 404 when the file is not found or not owned by the user', async () => {
    const { route } = loadRoute({ file: null })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 404)
    assert.deepEqual(await readJson(response), { error: 'Not found' })
  })

  it('returns 401 when the access token cannot be fetched', async () => {
    const { route } = loadRoute({ accessTokenError: new Error('expired') })

    const response = await route.GET({} as never, params)

    assert.equal(response.status, 401)
  })

  // ── plain text ──────────────────────────────────────────────────────────────

  it('returns plain text content for text/plain files', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'text/plain' },
      downloadBuffer: Buffer.from('Hello world'),
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'text')
    assert.equal(json.content, 'Hello world')
  })

  it('returns plain text content for text/markdown files', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'text/markdown' },
      downloadBuffer: Buffer.from('# Title\n\nBody.'),
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'text')
    assert.equal(json.content, '# Title\n\nBody.')
  })

  // ── CSV ─────────────────────────────────────────────────────────────────────

  it('parses CSV into a 2D table array', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'text/csv' },
      downloadBuffer: Buffer.from('Name,Score\nAlice,95\nBob,82'),
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'table')
    assert.deepEqual(json.rows[0], ['Name', 'Score'])
    assert.deepEqual(json.rows[1], ['Alice', '95'])
    assert.deepEqual(json.rows[2], ['Bob', '82'])
  })

  it('handles quoted CSV fields with commas inside them', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'text/csv' },
      downloadBuffer: Buffer.from('"Acme, Inc",Active\n"Beta Corp",Inactive'),
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'table')
    assert.equal(json.rows[0][0], 'Acme, Inc')
    assert.equal(json.rows[0][1], 'Active')
  })

  // ── Google Sheet ─────────────────────────────────────────────────────────────

  it('exports Google Sheets and returns them as a table', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/vnd.google-apps.spreadsheet' },
      exportContent: 'Col1,Col2\nA,1\nB,2',
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'table')
    assert.deepEqual(json.rows[0], ['Col1', 'Col2'])
    assert.deepEqual(json.rows[1], ['A', '1'])
  })

  // ── Excel ────────────────────────────────────────────────────────────────────

  it('returns multi-sheet data for Excel xlsx files', async () => {
    const buf = makeXlsxBuffer({
      Q1: [['Item', 'Amount'], ['Revenue', '100']],
      Q2: [['Item', 'Amount'], ['Revenue', '200']],
    })
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      downloadBuffer: buf,
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'table')
    assert.deepEqual(json.sheets, ['Q1', 'Q2'])
    assert.equal(json.activeSheet, 'Q1')
    assert.ok(json.sheetsData.Q1 !== undefined)
    assert.ok(json.sheetsData.Q2 !== undefined)
    // rows matches the active sheet's data
    assert.deepEqual(json.rows, json.sheetsData['Q1'])
  })

  it('filters empty rows from the Excel sheet data', async () => {
    const buf = makeXlsxBuffer({
      Sheet1: [['Col'], ['Value'], [''], ['Another']],
    })
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      downloadBuffer: buf,
    })

    const json = await readJson(await route.GET({} as never, params))

    // Empty rows are filtered out — only header + 2 data rows remain
    const sheet = json.sheetsData['Sheet1'] as string[][]
    assert.equal(sheet.every((row) => row.some((c) => c.trim() !== '')), true)
  })

  // ── DOCX ─────────────────────────────────────────────────────────────────────

  it('converts DOCX to HTML via mammoth', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      mammothHtml: '<p>Document content here</p>',
      downloadBuffer: Buffer.from('fake docx bytes'),
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'html')
    assert.match(json.content, /Document content here/)
  })

  it('strips color and background-color styles from DOCX HTML to prevent invisible text', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      mammothHtml: '<p style="color: white; font-size: 12px; background-color: black;">Text</p>',
      downloadBuffer: Buffer.from('fake docx bytes'),
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'html')
    // Color properties stripped
    assert.equal(json.content.includes('color'), false)
    // Other style properties kept
    assert.match(json.content, /font-size/)
  })

  // ── Google Doc ───────────────────────────────────────────────────────────────

  it('exports Google Docs as HTML and strips the <body> wrapper', async () => {
    const originalFetch = global.fetch
    global.fetch = async () =>
      ({
        ok: true,
        text: async () => '<html><head></head><body><p>Doc content</p></body></html>',
      }) as unknown as Response

    try {
      const { route } = loadRoute({
        file: { ...baseFile, mimeType: 'application/vnd.google-apps.document' },
      })

      const json = await readJson(await route.GET({} as never, params))

      assert.equal(json.type, 'html')
      assert.match(json.content, /Doc content/)
      // Should not include the outer html/body wrapper
      assert.equal(json.content.includes('<html'), false)
    } finally {
      global.fetch = originalFetch
    }
  })

  // ── PDF ──────────────────────────────────────────────────────────────────────

  it('returns a pdf url pointing to the raw streaming route', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/pdf' },
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'pdf')
    assert.equal(json.url, '/api/files/file-1/preview/raw')
  })

  // ── unsupported ───────────────────────────────────────────────────────────────

  it('returns unsupported for unknown MIME types', async () => {
    const { route } = loadRoute({
      file: { ...baseFile, mimeType: 'application/x-custom' },
    })

    const json = await readJson(await route.GET({} as never, params))

    assert.equal(json.type, 'unsupported')
  })
})
