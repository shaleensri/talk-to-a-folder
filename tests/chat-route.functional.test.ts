import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

interface RouteHarnessOptions {
  session?: { user?: { id?: string } } | null
  folder?: { id: string; status: string } | null
  chatImpl?: (folderId: string, message: string, sessionId: string, cb?: (token: string) => void) => Promise<unknown>
}

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  }
}

function makeInvalidJsonRequest() {
  return {
    json: async () => {
      throw new Error('invalid json')
    },
  }
}

function loadChatRoute(options: RouteHarnessOptions = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve('@/app/api/chat/route')
  delete require.cache[routePath]

  const calls = {
    getFolderById: [] as Array<{ folderId: string; userId: string }>,
    saveUserMessage: [] as Array<{ sessionId: string; content: string }>,
    chat: [] as Array<{ folderId: string; message: string; sessionId: string }>,
  }

  const session = options.session === undefined
    ? { user: { id: 'user-1' } }
    : options.session
  const folder = options.folder === undefined
    ? { id: 'folder-1', status: 'indexed' }
    : options.folder

  const chatImpl = options.chatImpl ?? (async (
    folderId: string,
    message: string,
    sessionId: string,
    cb?: (token: string) => void,
  ) => {
    calls.chat.push({ folderId, message, sessionId })
    cb?.('streamed answer')
    return {
      messageId: 'assistant-message-1',
      sessionId,
      answer: 'streamed answer',
      citations: [],
      metadata: {
        filesUsed: 0,
        chunksUsed: 0,
        confidence: 'low',
        latencyMs: 1,
        model: 'test-model',
      },
      debug: {
        query: message,
        retrievedChunks: [],
        selectedChunkIds: [],
        totalRetrieved: 0,
        totalSelected: 0,
        retrievalLatencyMs: 0,
        generationLatencyMs: 0,
        totalLatencyMs: 0,
      },
    }
  })

  Module._load = function mockLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === 'next-auth') {
      return {
        getServerSession: async () => session,
      }
    }

    if (request === '@/lib/auth') {
      return { authOptions: {} }
    }

    if (request === '@/services/folder-service') {
      return {
        getFolderById: async (folderId: string, userId: string) => {
          calls.getFolderById.push({ folderId, userId })
          return folder
        },
      }
    }

    if (request === '@/services/chat-service') {
      return {
        getOrCreateSession: async (_folderId: string, sessionId?: string) => {
          return sessionId ?? 'session-1'
        },
        saveUserMessage: async (sessionId: string, content: string) => {
          calls.saveUserMessage.push({ sessionId, content })
          return 'user-message-1'
        },
        chat: chatImpl,
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      route: require('@/app/api/chat/route') as typeof import('@/app/api/chat/route'),
      calls,
    }
  } finally {
    Module._load = originalLoad
  }
}

async function readJson(response: Response) {
  return JSON.parse(await response.text())
}

describe('functional: POST /api/chat', () => {
  it('returns 401 when the user is not authenticated', async () => {
    const { route } = loadChatRoute({ session: null })

    const response = await route.POST(makeRequest({ folderId: 'folder-1', message: 'Hi' }) as never)

    assert.equal(response.status, 401)
    assert.deepEqual(await readJson(response), { error: 'Unauthorized' })
  })

  it('returns 400 for invalid JSON', async () => {
    const { route } = loadChatRoute()

    const response = await route.POST(makeInvalidJsonRequest() as never)

    assert.equal(response.status, 400)
    assert.deepEqual(await readJson(response), { error: 'Invalid JSON' })
  })

  it('returns 400 when required fields are missing', async () => {
    const { route } = loadChatRoute()

    const response = await route.POST(makeRequest({ folderId: 'folder-1', message: '   ' }) as never)

    assert.equal(response.status, 400)
    assert.deepEqual(await readJson(response), { error: 'folderId and message are required' })
  })

  it('returns 404 when the folder does not belong to the user', async () => {
    const { route, calls } = loadChatRoute({ folder: null })

    const response = await route.POST(makeRequest({ folderId: 'folder-1', message: 'Hi' }) as never)

    assert.equal(response.status, 404)
    assert.deepEqual(await readJson(response), { error: 'Folder not found' })
    assert.deepEqual(calls.getFolderById, [{ folderId: 'folder-1', userId: 'user-1' }])
  })

  it('returns 400 when the folder is not indexed', async () => {
    const { route } = loadChatRoute({ folder: { id: 'folder-1', status: 'ingesting' } })

    const response = await route.POST(makeRequest({ folderId: 'folder-1', message: 'Hi' }) as never)

    assert.equal(response.status, 400)
    assert.deepEqual(await readJson(response), {
      error: 'Folder is not indexed yet. Please wait for ingestion to complete.',
    })
  })

  it('streams tokens and structured payloads as SSE on success', async () => {
    const { route, calls } = loadChatRoute()

    const response = await route.POST(
      makeRequest({ folderId: 'folder-1', message: '  Summarize this  ', sessionId: 'existing-session' }) as never,
    )
    const body = await response.text()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream')
    assert.match(body, /data: .*"type":"token"/)
    assert.match(body, /data: .*"type":"citations"/)
    assert.match(body, /data: .*"type":"metadata"/)
    assert.match(body, /data: .*"type":"debug"/)
    assert.match(body, /data: .*"type":"done"/)
    assert.deepEqual(calls.saveUserMessage, [
      { sessionId: 'existing-session', content: 'Summarize this' },
    ])
    assert.deepEqual(calls.chat, [
      { folderId: 'folder-1', message: 'Summarize this', sessionId: 'existing-session' },
    ])
  })

  it('rate limits the 21st request for the same user in a 60s window', async () => {
    const { route } = loadChatRoute()

    for (let i = 0; i < 20; i++) {
      const response = await route.POST(makeRequest({ folderId: 'folder-1', message: `Q${i}` }) as never)
      assert.equal(response.status, 200)
      await response.text()
    }

    const limited = await route.POST(makeRequest({ folderId: 'folder-1', message: 'too many' }) as never)
    const json = await readJson(limited)

    assert.equal(limited.status, 429)
    assert.equal(limited.headers.has('Retry-After'), true)
    assert.match(json.error, /^Rate limit exceeded\. Try again in \d+s\.$/)
  })
})
