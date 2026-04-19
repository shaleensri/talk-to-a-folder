import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

function loadChatService(options: {
  existingSession?: { id: string } | null
  recentMessages?: Array<{ role: string; content: string }>
} = {}) {
  const originalLoad = Module._load
  const modulePath = require.resolve('@/services/chat-service')
  delete require.cache[modulePath]

  const retrieval = {
    selectedChunks: [],
    isSupported: true,
    folderIds: ['folder-1'],
    intent: 'targeted_fact',
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

  const generated = {
    answer: 'Generated answer [1]',
    citations: [
      {
        id: 'citation-1',
        index: 1,
        fileId: 'file-1',
        fileName: 'File.txt',
        chunkId: 'chunk-1',
        chunkText: 'Chunk',
        relevanceScore: 0.7,
      },
    ],
    metadata: {
      filesUsed: 1,
      chunksUsed: 1,
      confidence: 'high',
      latencyMs: 3,
      model: 'test-model',
    },
  }

  const calls = {
    chatSessionFindUnique: [] as unknown[],
    chatSessionCreate: [] as unknown[],
    chatMessageCreate: [] as unknown[],
    chatMessageFindMany: [] as unknown[],
    retrieve: [] as Array<{ query: string; folderId: string }>,
    generateAnswer: [] as Array<{ query: string; history: unknown[]; hasCallback: boolean }>,
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
            create: async (args: { data: { id: string; folderId: string } }) => {
              calls.chatSessionCreate.push(args)
              return { id: args.data.id, folderId: args.data.folderId }
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
        },
      }
    }

    if (request === '@/lib/retrieval') {
      return {
        retrieve: async (query: string, folderId: string) => {
          calls.retrieve.push({ query, folderId })
          return retrieval
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
          calls.generateAnswer.push({ query, history, hasCallback: Boolean(streamCallback) })
          streamCallback?.('token')
          return generated
        },
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      service: require('@/services/chat-service') as typeof import('@/services/chat-service'),
      calls,
      retrieval,
      generated,
    }
  } finally {
    Module._load = originalLoad
  }
}

describe('functional: chat service', () => {
  it('reuses an existing chat session', async () => {
    const { service, calls } = loadChatService({ existingSession: { id: 'session-1' } })

    const sessionId = await service.getOrCreateSession('folder-1', 'session-1')

    assert.equal(sessionId, 'session-1')
    assert.equal(calls.chatSessionCreate.length, 0)
    assert.deepEqual(calls.chatSessionFindUnique, [{ where: { id: 'session-1' } }])
  })

  it('creates a new chat session when no valid session exists', async () => {
    const { service, calls } = loadChatService({ existingSession: null })

    const sessionId = await service.getOrCreateSession('folder-1', 'missing-session')

    assert.equal(typeof sessionId, 'string')
    assert.equal(calls.chatSessionCreate.length, 1)
    assert.equal((calls.chatSessionCreate[0] as { data: { folderId: string } }).data.folderId, 'folder-1')
  })

  it('saves user and assistant messages with the expected shape', async () => {
    const { service, calls, generated, retrieval } = loadChatService()

    const userMessageId = await service.saveUserMessage('session-1', 'Hello')
    const assistantMessageId = await service.saveAssistantMessage('session-1', {
      messageId: 'message-1',
      sessionId: 'session-1',
      answer: generated.answer,
      citations: generated.citations,
      metadata: generated.metadata,
      debug: retrieval.debugInfo,
    })

    assert.equal(typeof userMessageId, 'string')
    assert.equal(typeof assistantMessageId, 'string')
    assert.equal(calls.chatMessageCreate.length, 2)
    assert.equal((calls.chatMessageCreate[0] as { data: { role: string } }).data.role, 'user')
    const assistantCreate = calls.chatMessageCreate[1] as {
      data: { role: string; citations: string; metadata: string; debugInfo: string }
    }
    assert.equal(assistantCreate.data.role, 'assistant')
    assert.deepEqual(JSON.parse(assistantCreate.data.citations), generated.citations)
    assert.deepEqual(JSON.parse(assistantCreate.data.metadata), generated.metadata)
    assert.deepEqual(JSON.parse(assistantCreate.data.debugInfo), retrieval.debugInfo)
  })

  it('orchestrates retrieval, history injection, generation, streaming, and persistence', async () => {
    const recentMessages = [
      { role: 'user', content: 'Current question' },
      { role: 'assistant', content: 'Previous answer' },
      { role: 'user', content: 'Previous question' },
    ]
    const { service, calls, generated, retrieval } = loadChatService({ recentMessages })
    const streamed: string[] = []

    const response = await service.chat('folder-1', 'Current question', 'session-1', (token) => {
      streamed.push(token)
    })

    assert.deepEqual(calls.retrieve, [{ query: 'Current question', folderId: 'folder-1' }])
    assert.deepEqual(calls.generateAnswer, [
      {
        query: 'Current question',
        history: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
        ],
        hasCallback: true,
      },
    ])
    assert.deepEqual(streamed, ['token'])
    assert.equal(response.sessionId, 'session-1')
    assert.equal(response.answer, generated.answer)
    assert.deepEqual(response.citations, generated.citations)
    assert.deepEqual(response.metadata, generated.metadata)
    assert.deepEqual(response.debug, retrieval.debugInfo)
    assert.equal(calls.chatMessageCreate.at(-1)?.data.role, 'assistant')
  })
})
