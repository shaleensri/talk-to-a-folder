import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

const baseDbSession = {
  id: 'session-1',
  userId: 'user-1',
  updatedAt: new Date('2026-01-01'),
  folders: [{ folderId: 'folder-1' }],
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      citations: null,
      metadata: null,
      debugInfo: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      citations: JSON.stringify([{ index: 1, chunkId: 'chunk-1' }]),
      metadata: JSON.stringify({ confidence: 'high', filesUsed: 1 }),
      debugInfo: JSON.stringify({ retrievalLatencyMs: 42 }),
      createdAt: new Date('2026-01-01T00:00:01Z'),
    },
  ],
}

function loadRoute(options: {
  session?: { user?: { id?: string } } | null
  dbSessions?: unknown[]
} = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve('@/app/api/sessions/route')
  delete require.cache[routePath]

  const authSession =
    options.session === undefined ? { user: { id: 'user-1' } } : options.session

  Module._load = function mockLoad(request: string) {
    if (request === 'next-auth') {
      return { getServerSession: async () => authSession }
    }

    if (request === '@/lib/auth') {
      return { authOptions: {} }
    }

    if (request === '@/lib/prisma') {
      return {
        prisma: {
          chatSession: {
            findMany: async () => options.dbSessions ?? [baseDbSession],
          },
        },
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return { route: require('@/app/api/sessions/route') }
  } finally {
    Module._load = originalLoad
  }
}

async function readJson(response: Response) {
  return JSON.parse(await response.text())
}

describe('functional: GET /api/sessions', () => {
  it('returns 401 when unauthenticated', async () => {
    const { route } = loadRoute({ session: null })

    const response = await route.GET()

    assert.equal(response.status, 401)
    assert.deepEqual(await readJson(response), { error: 'Unauthorized' })
  })

  it('returns sessions with messages and their folderIds', async () => {
    const { route } = loadRoute()

    const response = await route.GET()

    assert.equal(response.status, 200)
    const json = await readJson(response)
    assert.equal(json.sessions.length, 1)
    assert.equal(json.sessions[0].id, 'session-1')
    assert.deepEqual(json.sessions[0].folderIds, ['folder-1'])
    assert.equal(json.sessions[0].messages.length, 2)
  })

  it('parses JSON citation, metadata, and debugInfo fields on assistant messages', async () => {
    const { route } = loadRoute()

    const json = await readJson(await route.GET())
    const assistantMsg = json.sessions[0].messages[1]

    assert.deepEqual(assistantMsg.citations, [{ index: 1, chunkId: 'chunk-1' }])
    assert.deepEqual(assistantMsg.metadata, { confidence: 'high', filesUsed: 1 })
    assert.deepEqual(assistantMsg.debugInfo, { retrievalLatencyMs: 42 })
  })

  it('leaves citations/metadata/debugInfo as undefined when the DB columns are null', async () => {
    const { route } = loadRoute()

    const json = await readJson(await route.GET())
    const userMsg = json.sessions[0].messages[0]

    assert.equal(userMsg.citations, undefined)
    assert.equal(userMsg.metadata, undefined)
    assert.equal(userMsg.debugInfo, undefined)
  })

  it('filters out sessions whose folders have all been deleted', async () => {
    const orphanSession = { ...baseDbSession, id: 'session-orphan', folders: [], messages: [] }
    const { route } = loadRoute({ dbSessions: [baseDbSession, orphanSession] })

    const json = await readJson(await route.GET())

    assert.equal(json.sessions.length, 1)
    assert.equal(json.sessions[0].id, 'session-1')
  })

  it('returns an empty list when there are no sessions', async () => {
    const { route } = loadRoute({ dbSessions: [] })

    const json = await readJson(await route.GET())

    assert.deepEqual(json.sessions, [])
  })
})
