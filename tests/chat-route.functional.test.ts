import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

interface RouteHarnessOptions {
  session?: { user?: { id?: string } } | null
  folders?: Array<{ id: string; status: string }> | null
  chatImpl?: (...args: unknown[]) => Promise<unknown>
}

function makeRequest(body: unknown) {
  return { json: async () => body }
}

function makeInvalidJsonRequest() {
  return {
    json: async () => { throw new Error('invalid json') },
  }
}

function loadChatRoute(options: RouteHarnessOptions = {}) {
  const originalLoad = Module._load
  const routePath = require.resolve('@/app/api/chat/route')
  delete require.cache[routePath]

  const calls = {
    getFolderById: [] as Array<{ folderId: string; userId: string }>,
    saveUserMessage: [] as Array<{ sessionId: string; content: string }>,
    chat: [] as Array<{ folderIds: string[]; message: string; sessionId: string }>,
  }

  const session = options.session === undefined
    ? { user: { id: 'user-1' } }
    : options.session

  // Default: one indexed folder
  const defaultFolders = [{ id: 'folder-1', status: 'indexed' }]
  const folders = options.folders === undefined ? defaultFolders : options.folders

  Module._load = function mockLoad(request: string) {
    if (request === 'next-auth') {
      return { getServerSession: async () => session }
    }

    if (request === '@/lib/auth') {
      return { authOptions: {} }
    }

    if (request === '@/services/folder-service') {
      return {
        getFolderById: async (folderId: string, userId: string) => {
          calls.getFolderById.push({ folderId, userId })
          if (folders === null) return null
          return folders.find((f) => f.id === folderId) ?? null
        },
      }
    }

    if (request === '@/services/chat-service') {
      return {
        getOrCreateSession: async (_folderIds: string[], _userId: string, sessionId?: string) => {
          return sessionId ?? 'session-1'
        },
        saveUserMessage: async (sessionId: string, content: string) => {
          calls.saveUserMessage.push({ sessionId, content })
          return 'user-msg-1'
        },
        chat: options.chatImpl ?? (async (
          folderIds: string[],
          message: string,
          sessionId: string,
          cb?: (token: string) => void,
        ) => {
          calls.chat.push({ folderIds, message, sessionId })
          cb?.('streamed answer')
          return {
            messageId: 'assistant-msg-1',
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
              intent: 'targeted_fact',
              retrievedChunks: [],
              selectedChunkIds: [],
              totalRetrieved: 0,
              totalSelected: 0,
              retrievalLatencyMs: 0,
              generationLatencyMs: 0,
              totalLatencyMs: 0,
            },
          }
        }),
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

    const response = await route.POST(makeRequest({ folderIds: ['folder-1'], message: 'Hi' }) as never)

    assert.equal(response.status, 401)
    assert.deepEqual(await readJson(response), { error: 'Unauthorized' })
  })

  it('returns 400 for invalid JSON', async () => {
    const { route } = loadChatRoute()

    const response = await route.POST(makeInvalidJsonRequest() as never)

    assert.equal(response.status, 400)
    assert.deepEqual(await readJson(response), { error: 'Invalid JSON' })
  })

  it('returns 400 when folderIds is empty or message is blank', async () => {
    const { route } = loadChatRoute()

    const noFolders = await route.POST(makeRequest({ folderIds: [], message: 'Hi' }) as never)
    const blankMsg = await route.POST(makeRequest({ folderIds: ['folder-1'], message: '   ' }) as never)

    assert.equal(noFolders.status, 400)
    assert.match((await readJson(noFolders)).error, /folderIds and message are required/)
    assert.equal(blankMsg.status, 400)
    assert.match((await readJson(blankMsg)).error, /folderIds and message are required/)
  })

  it('returns 404 when a folder does not belong to the user', async () => {
    const { route } = loadChatRoute({ folders: null })

    const response = await route.POST(
      makeRequest({ folderIds: ['folder-missing'], message: 'Hi' }) as never,
    )

    assert.equal(response.status, 404)
    assert.match((await readJson(response)).error, /not found/i)
  })

  it('returns 400 when a folder is not fully indexed', async () => {
    const { route } = loadChatRoute({
      folders: [{ id: 'folder-1', status: 'ingesting' }],
    })

    const response = await route.POST(
      makeRequest({ folderIds: ['folder-1'], message: 'Summarize' }) as never,
    )

    assert.equal(response.status, 400)
    assert.match((await readJson(response)).error, /indexed/i)
  })

  it('streams SSE chunks (token, citations, metadata, debug, done) on success', async () => {
    const { route, calls } = loadChatRoute()

    const response = await route.POST(
      makeRequest({
        folderIds: ['folder-1'],
        message: '  What is covered?  ',
        sessionId: 'existing-session',
      }) as never,
    )
    const body = await response.text()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream')
    assert.match(body, /data: .*"type":"token"/)
    assert.match(body, /data: .*"type":"citations"/)
    assert.match(body, /data: .*"type":"metadata"/)
    assert.match(body, /data: .*"type":"debug"/)
    assert.match(body, /data: .*"type":"done"/)
    // message is trimmed before saving
    assert.deepEqual(calls.saveUserMessage, [
      { sessionId: 'existing-session', content: 'What is covered?' },
    ])
    // folderIds passed as array
    assert.deepEqual(calls.chat[0].folderIds, ['folder-1'])
  })

  it('passes sourceFileId to the chat function when provided in the request body', async () => {
    const { route, calls } = loadChatRoute()
    let capturedSourceFileId: string | undefined

    // Patch the chat mock to capture sourceFileId
    Module._load // already loaded; we re-test via the actual route's behavior
    const chatCallCapture: unknown[] = []
    const { route: routeWithCapture } = loadChatRoute({
      chatImpl: async (
        folderIds: unknown,
        message: unknown,
        sessionId: unknown,
        cb?: (token: string) => void,
        sourceFileId?: string,
      ) => {
        chatCallCapture.push({ folderIds, message, sessionId, sourceFileId })
        cb?.('tok')
        return {
          messageId: 'msg-1',
          sessionId: 'session-1',
          answer: 'tok',
          citations: [],
          metadata: { filesUsed: 0, chunksUsed: 0, confidence: 'low' as const, latencyMs: 1, model: 'x' },
          debug: {
            query: 'q', intent: 'targeted_fact',
            retrievedChunks: [], selectedChunkIds: [],
            totalRetrieved: 0, totalSelected: 0,
            retrievalLatencyMs: 0, generationLatencyMs: 0, totalLatencyMs: 0,
          },
        }
      },
    })

    await routeWithCapture.POST(
      makeRequest({
        folderIds: ['folder-1'],
        message: '> quote text\n\nWhat is this?',
        sourceFileId: 'file-xyz',
      }) as never,
    ).then((r) => r.text())

    assert.equal((chatCallCapture[0] as { sourceFileId: string }).sourceFileId, 'file-xyz')
  })

  it('rate limits requests after the per-user limit is exceeded in a time window', async () => {
    const { route } = loadChatRoute()

    // Exhaust the quota (20 per 60s)
    for (let i = 0; i < 20; i++) {
      const res = await route.POST(makeRequest({ folderIds: ['folder-1'], message: `Q${i}` }) as never)
      assert.equal(res.status, 200)
      await res.text() // drain stream
    }

    const limited = await route.POST(makeRequest({ folderIds: ['folder-1'], message: 'over limit' }) as never)
    const json = await readJson(limited)

    assert.equal(limited.status, 429)
    assert.ok(limited.headers.has('Retry-After'))
    assert.match(json.error, /Rate limit exceeded/i)
  })
})
