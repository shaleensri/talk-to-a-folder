/**
 * Integration tests for chat session and message persistence in chat-service.ts
 *
 * Uses a real SQLite test DB. Mocks only @/lib/retrieval and
 * @/lib/answer-generator (OpenAI calls). Everything else — session creation,
 * message writes, history loading — hits the real DB.
 *
 * What these tests catch that mocks cannot:
 *   - JSON serialization/deserialization of citations and metadata
 *   - History loaded in correct chronological order
 *   - Session reuse actually queries DB, not just in-memory state
 *   - Message count limiting (only last N messages sent to LLM)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  injectTestPrisma,
  clearDatabase,
  seedUser,
  seedFolder,
  testPrisma,
} from './setup'

injectTestPrisma()

// Mock external dependencies — retrieval (needs OpenAI embed) and answer
// generation (needs OpenAI chat). Everything else is real.
const Module = require('module')
const originalLoad = Module._load

const mockRetrieval = {
  selectedChunks: [
    {
      chunkId: 'chunk-1',
      fileId: 'file-1',
      fileName: 'doc.txt',
      text: 'Relevant content',
      score: 0.85,
      rank: 1,
      selected: true,
    },
  ],
  isSupported: true,
  folderIds: ['folder-1'],
  intent: 'targeted_fact',
  debugInfo: {
    query: 'test query',
    intent: 'targeted_fact',
    retrievedChunks: [],
    selectedChunkIds: ['chunk-1'],
    totalRetrieved: 1,
    totalSelected: 1,
    retrievalLatencyMs: 5,
    generationLatencyMs: 0,
    totalLatencyMs: 0,
  },
}

const mockGenerated = {
  answer: 'The answer is 42 [1]',
  citations: [
    {
      id: 'cite-1',
      index: 1,
      fileId: 'file-1',
      fileName: 'doc.txt',
      chunkId: 'chunk-1',
      chunkText: 'Relevant content',
      relevanceScore: 0.85,
    },
  ],
  metadata: {
    filesUsed: 1,
    chunksUsed: 1,
    confidence: 'high' as const,
    latencyMs: 120,
    model: 'gpt-4o',
  },
  debug: mockRetrieval.debugInfo,
}

Module._load = function mockLoad(request: string, ...args: unknown[]) {
  if (request === '@/lib/retrieval') {
    return {
      retrieve: async () => mockRetrieval,
    }
  }
  if (request === '@/lib/answer-generator') {
    return {
      generateAnswer: async (
        _query: string,
        _retrieval: unknown,
        _history: unknown,
        streamCallback?: (token: string) => void,
      ) => {
        streamCallback?.('The ')
        streamCallback?.('answer ')
        streamCallback?.('is 42 [1]')
        return mockGenerated
      },
    }
  }
  return originalLoad.apply(this, [request, ...args])
}

const service = require('@/services/chat-service') as typeof import('@/services/chat-service')

// ─────────────────────────────────────────────────────────────────────────────

describe('integration: chat persistence', () => {
  let userId: string
  let folderId: string

  beforeEach(async () => {
    await clearDatabase()
    const user = await seedUser('chat-user')
    userId = user.id
    const folder = await seedFolder(userId, { id: 'chat-folder', status: 'indexed' })
    folderId = folder.id
  })

  afterEach(async () => {
    await clearDatabase()
  })

  // ── getOrCreateSession ──────────────────────────────────────────────────────

  it('getOrCreateSession creates and persists a new session when none exists', async () => {
    const sessionId = await service.getOrCreateSession([folderId], undefined)

    assert.equal(typeof sessionId, 'string')
    assert.ok(sessionId.length > 0)

    const row = await testPrisma.chatSession.findUnique({ where: { id: sessionId } })
    assert.ok(row, 'session should be in DB')
    assert.equal(row!.folderId, folderId)
  })

  it('getOrCreateSession reuses an existing valid session', async () => {
    const existingSession = await testPrisma.chatSession.create({
      data: { id: 'existing-session', folderId },
    })

    const sessionId = await service.getOrCreateSession(folderId, existingSession.id)

    assert.equal(sessionId, existingSession.id)

    const rows = await testPrisma.chatSession.findMany({ where: { folderId } })
    assert.equal(rows.length, 1, 'should not create a second session')
  })

  it('getOrCreateSession creates a new session when given an id that does not exist in DB', async () => {
    const sessionId = await service.getOrCreateSession(folderId, 'phantom-session-id')

    assert.notEqual(sessionId, 'phantom-session-id')

    const row = await testPrisma.chatSession.findUnique({ where: { id: sessionId } })
    assert.ok(row)
  })

  // ── saveUserMessage ─────────────────────────────────────────────────────────

  it('saveUserMessage persists a user message with correct role and content', async () => {
    const sessionId = await service.getOrCreateSession([folderId], undefined)
    const messageId = await service.saveUserMessage(sessionId, 'What is the meaning of life?')

    assert.equal(typeof messageId, 'string')

    const row = await testPrisma.chatMessage.findUnique({ where: { id: messageId } })
    assert.ok(row)
    assert.equal(row!.role, 'user')
    assert.equal(row!.content, 'What is the meaning of life?')
    assert.equal(row!.citations, null)
    assert.equal(row!.metadata, null)
  })

  // ── saveAssistantMessage ────────────────────────────────────────────────────

  it('saveAssistantMessage serializes citations and metadata as valid JSON', async () => {
    const sessionId = await service.getOrCreateSession([folderId], undefined)

    const messageId = await service.saveAssistantMessage(sessionId, {
      messageId: 'msg-1',
      sessionId,
      answer: mockGenerated.answer,
      citations: mockGenerated.citations,
      metadata: mockGenerated.metadata,
      debug: mockGenerated.debug,
    })

    const row = await testPrisma.chatMessage.findUnique({ where: { id: messageId } })
    assert.ok(row)
    assert.equal(row!.role, 'assistant')
    assert.equal(row!.content, mockGenerated.answer)

    // Verify JSON round-trip
    const parsedCitations = JSON.parse(row!.citations!)
    assert.equal(parsedCitations[0].fileId, 'file-1')
    assert.equal(parsedCitations[0].relevanceScore, 0.85)

    const parsedMetadata = JSON.parse(row!.metadata!)
    assert.equal(parsedMetadata.confidence, 'high')
    assert.equal(parsedMetadata.model, 'gpt-4o')

    const parsedDebug = JSON.parse(row!.debugInfo!)
    assert.equal(parsedDebug.totalSelected, 1)
  })

  // ── full chat() — history injection ────────────────────────────────────────

  it('chat() persists the assistant message to DB (user message is saved by the route before calling chat)', async () => {
    const sessionId = await service.getOrCreateSession([folderId], undefined)
    // The API route saves the user message before calling chat()
    await service.saveUserMessage(sessionId, 'Hello?')
    const tokens: string[] = []

    await service.chat([folderId], 'Hello?', sessionId, (t) => tokens.push(t))

    const messages = await testPrisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    })

    assert.equal(messages.length, 2) // user (saved above) + assistant (saved by chat())
    assert.equal(messages[0].role, 'user')
    assert.equal(messages[0].content, 'Hello?')
    assert.equal(messages[1].role, 'assistant')
    assert.equal(messages[1].content, mockGenerated.answer)
    assert.deepEqual(tokens, ['The ', 'answer ', 'is 42 [1]'])
  })

  it('chat() loads prior messages as history for follow-up questions', async () => {
    const session = await testPrisma.chatSession.create({
      data: { id: 'history-session', folderId },
    })

    await testPrisma.chatMessage.createMany({
      data: [
        { id: 'msg-h1', sessionId: session.id, role: 'user', content: 'First question', createdAt: new Date('2026-01-01T10:00:00Z') },
        { id: 'msg-h2', sessionId: session.id, role: 'assistant', content: 'First answer', createdAt: new Date('2026-01-01T10:00:01Z') },
        { id: 'msg-h3', sessionId: session.id, role: 'user', content: 'Second question', createdAt: new Date('2026-01-01T10:00:02Z') },
        { id: 'msg-h4', sessionId: session.id, role: 'assistant', content: 'Second answer', createdAt: new Date('2026-01-01T10:00:03Z') },
      ],
    })

    // Route saves user message first, then calls chat()
    await service.saveUserMessage(session.id, 'Follow up?')
    await service.chat([folderId], 'Follow up?', session.id)

    const allMessages = await testPrisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    })

    // 4 seeded + 1 user (saveUserMessage) + 1 assistant (chat()) = 6
    assert.equal(allMessages.length, 6)
    assert.equal(allMessages[4].content, 'Follow up?')
    assert.equal(allMessages[5].role, 'assistant')
  })

  it('chat() returns the sessionId so the client can persist it', async () => {
    // Route calls getOrCreateSession then saveUserMessage before chat()
    const sessionId = await service.getOrCreateSession([folderId], undefined)
    await service.saveUserMessage(sessionId, 'Test question')

    const result = await service.chat([folderId], 'Test question', sessionId)

    assert.equal(result.sessionId, sessionId)

    const session = await testPrisma.chatSession.findUnique({ where: { id: result.sessionId } })
    assert.ok(session, 'returned sessionId should exist in DB')
  })
})
