import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

const baseRetrieval = {
  selectedChunks: [],
  isSupported: true,
  folderIds: ['folder-1'],
  intent: 'targeted_fact' as const,
  debugInfo: {
    query: 'Question?',
    intent: 'targeted_fact',
    retrievedChunks: [],
    selectedChunkIds: [],
    totalRetrieved: 0,
    totalSelected: 0,
    retrievalLatencyMs: 1,
    generationLatencyMs: 2,
    totalLatencyMs: 3,
  },
}

const baseGenerated = {
  answer: 'Generated answer [1]',
  citations: [
    {
      id: 'citation-1',
      index: 1,
      fileId: 'file-1',
      folderId: 'folder-1',
      fileName: 'File.txt',
      chunkId: 'chunk-1',
      chunkText: 'Chunk text',
      relevanceScore: 0.7,
    },
  ],
  metadata: {
    filesUsed: 1,
    chunksUsed: 1,
    confidence: 'high' as const,
    latencyMs: 3,
    model: 'test-model',
  },
}

interface HarnessOptions {
  existingSession?: { id: string } | null
  recentMessages?: Array<{ role: string; content: string }>
}

function loadChatService(options: HarnessOptions = {}) {
  const originalLoad = Module._load
  const modulePath = require.resolve('@/services/chat-service')
  delete require.cache[modulePath]

  const calls = {
    chatSessionFindUnique: [] as unknown[],
    chatSessionCreate: [] as unknown[],
    chatMessageCreate: [] as unknown[],
    chatMessageFindMany: [] as unknown[],
    indexedFolderFindMany: [] as unknown[],
    retrieve: [] as Array<{ query: string; folderIds: string[]; sourceFileId?: string }>,
    generateAnswer: [] as Array<{ query: string; history: unknown[] }>,
  }

  Module._load = function mockLoad(request: string) {
    if (request === '@/lib/prisma') {
      return {
        prisma: {
          chatSession: {
            findUnique: async (args: unknown) => {
              calls.chatSessionFindUnique.push(args)
              return options.existingSession ?? null
            },
            create: async (args: { data: { id: string; folders: { create: unknown[] } } }) => {
              calls.chatSessionCreate.push(args)
              return { id: args.data.id }
            },
          },
          chatMessage: {
            create: async (args: { data: { id: string } }) => {
              calls.chatMessageCreate.push(args)
              return { id: args.data.id }
            },
            findMany: async (args: unknown) => {
              calls.chatMessageFindMany.push(args)
              return options.recentMessages ?? []
            },
          },
          indexedFolder: {
            findMany: async (args: unknown) => {
              calls.indexedFolderFindMany.push(args)
              return [{ id: 'folder-1', name: 'My Folder' }]
            },
          },
        },
      }
    }

    if (request === '@/lib/retrieval') {
      return {
        retrieve: async (
          query: string,
          folderIds: string[],
          _history: unknown[],
          sourceFileId?: string,
        ) => {
          calls.retrieve.push({ query, folderIds, sourceFileId })
          return baseRetrieval
        },
      }
    }

    if (request === '@/lib/answer-generator') {
      return {
        generateAnswer: async (
          query: string,
          _retrieval: unknown,
          history: unknown[],
          streamCallback?: (token: string) => void,
        ) => {
          calls.generateAnswer.push({ query, history })
          streamCallback?.('token')
          return baseGenerated
        },
      }
    }

    if (request === '@/lib/utils') {
      const actual = originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
      return actual
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      service: require('@/services/chat-service') as typeof import('@/services/chat-service'),
      calls,
    }
  } finally {
    Module._load = originalLoad
  }
}

describe('functional: chat service', () => {
  it('reuses an existing chat session when a valid sessionId is provided', async () => {
    const { service, calls } = loadChatService({ existingSession: { id: 'session-1' } })

    const sessionId = await service.getOrCreateSession(['folder-1'], 'user-1', 'session-1')

    assert.equal(sessionId, 'session-1')
    assert.equal(calls.chatSessionCreate.length, 0)
    assert.deepEqual(calls.chatSessionFindUnique, [{ where: { id: 'session-1' } }])
  })

  it('creates a new session when no sessionId is given', async () => {
    const { service, calls } = loadChatService({ existingSession: null })

    const sessionId = await service.getOrCreateSession(['folder-1', 'folder-2'], 'user-1')

    assert.equal(typeof sessionId, 'string')
    assert.equal(sessionId.length > 0, true)
    assert.equal(calls.chatSessionCreate.length, 1)
  })

  it('creates a new session when the provided sessionId does not exist in DB', async () => {
    const { service, calls } = loadChatService({ existingSession: null })

    const sessionId = await service.getOrCreateSession(['folder-1'], 'user-1', 'ghost-session')

    assert.equal(typeof sessionId, 'string')
    assert.equal(calls.chatSessionCreate.length, 1)
  })

  it('saveUserMessage persists the message and returns a string id', async () => {
    const { service, calls } = loadChatService()

    const id = await service.saveUserMessage('session-1', 'Hello world')

    assert.equal(typeof id, 'string')
    assert.equal(calls.chatMessageCreate.length, 1)
    const created = calls.chatMessageCreate[0] as { data: { role: string; content: string } }
    assert.equal(created.data.role, 'user')
    assert.equal(created.data.content, 'Hello world')
  })

  it('saveAssistantMessage serialises citations, metadata and debug to JSON', async () => {
    const { service, calls } = loadChatService()

    await service.saveAssistantMessage('session-1', {
      messageId: 'msg-1',
      sessionId: 'session-1',
      answer: baseGenerated.answer,
      citations: baseGenerated.citations,
      metadata: baseGenerated.metadata,
      debug: baseRetrieval.debugInfo,
    })

    const created = calls.chatMessageCreate[0] as {
      data: { role: string; citations: string; metadata: string; debugInfo: string }
    }
    assert.equal(created.data.role, 'assistant')
    assert.deepEqual(JSON.parse(created.data.citations), baseGenerated.citations)
    assert.deepEqual(JSON.parse(created.data.metadata), baseGenerated.metadata)
    assert.deepEqual(JSON.parse(created.data.debugInfo), baseRetrieval.debugInfo)
  })

  it('chat() passes folderIds (array) to retrieve and returns the full response', async () => {
    const { service, calls } = loadChatService()
    const streamed: string[] = []

    const response = await service.chat(
      ['folder-1', 'folder-2'],
      'What is the revenue?',
      'session-1',
      (token) => streamed.push(token),
    )

    assert.deepEqual(calls.retrieve[0].folderIds, ['folder-1', 'folder-2'])
    assert.deepEqual(streamed, ['token'])
    assert.equal(response.answer, baseGenerated.answer)
    assert.deepEqual(response.citations, baseGenerated.citations)
    // assistant message was persisted
    const lastCreate = calls.chatMessageCreate.at(-1) as { data: { role: string } }
    assert.equal(lastCreate?.data.role, 'assistant')
  })

  it('chat() passes sourceFileId through to retrieve when provided', async () => {
    const { service, calls } = loadChatService()

    await service.chat(
      ['folder-1'],
      '> Some quoted text\n\nWhat does this mean?',
      'session-1',
      undefined,
      'file-abc',
    )

    assert.equal(calls.retrieve[0].sourceFileId, 'file-abc')
  })

  it('chat() uses the quoted excerpt as the retrieval query when sourceFileId is set', async () => {
    const { service, calls } = loadChatService()

    await service.chat(
      ['folder-1'],
      '> Important excerpt about revenue\n\nCan you explain this?',
      'session-1',
      undefined,
      'file-abc',
    )

    // The retrieval query should be the quoted text, not the user question
    assert.equal(calls.retrieve[0].query, 'Important excerpt about revenue')
  })

  it('chat() injects trimmed conversation history into generateAnswer', async () => {
    const recentMessages = [
      { role: 'user', content: 'Older question' },
      { role: 'assistant', content: 'Older answer' },
      { role: 'user', content: 'This is the current question — will be dropped' },
    ]
    const { service, calls } = loadChatService({ recentMessages })

    await service.chat(['folder-1'], 'This is the current question — will be dropped', 'session-1')

    // The last message (current query) should be dropped from history before passing to generateAnswer
    const historyPassedIn = calls.generateAnswer[0].history as Array<{ role: string }>
    assert.equal(historyPassedIn.some((m) => m.role === 'user'), true)
    // Verify the current message is not duplicated in history
    const userMessages = historyPassedIn.filter((m) => m.role === 'user')
    assert.equal(userMessages.length <= 1, true)
  })
})
