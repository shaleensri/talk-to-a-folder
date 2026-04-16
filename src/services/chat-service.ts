import { prisma } from '@/lib/prisma'
import { retrieve } from '@/lib/retrieval'
import { generateAnswer } from '@/lib/answer-generator'
import { generateId } from '@/lib/utils'
import type { ChatResponse } from '@/types'

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function getOrCreateSession(
  folderId: string,
  sessionId?: string,
): Promise<string> {
  if (sessionId) {
    const existing = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    })
    if (existing) return sessionId
  }

  const session = await prisma.chatSession.create({
    data: {
      id: generateId(),
      folderId,
    },
  })
  return session.id
}

// ---------------------------------------------------------------------------
// Persist messages
// ---------------------------------------------------------------------------

export async function saveUserMessage(
  sessionId: string,
  content: string,
): Promise<string> {
  const message = await prisma.chatMessage.create({
    data: {
      id: generateId(),
      sessionId,
      role: 'user',
      content,
    },
  })
  return message.id
}

export async function saveAssistantMessage(
  sessionId: string,
  response: ChatResponse,
): Promise<string> {
  const message = await prisma.chatMessage.create({
    data: {
      id: generateId(),
      sessionId,
      role: 'assistant',
      content: response.answer,
      citations: JSON.stringify(response.citations),
      metadata: JSON.stringify(response.metadata),
      debugInfo: JSON.stringify(response.debug),
    },
  })
  return message.id
}

// ---------------------------------------------------------------------------
// Full chat pipeline (retrieve → generate), with optional streaming
// ---------------------------------------------------------------------------

const HISTORY_TURNS = 6 // last 6 messages = 3 user+assistant turns

export async function chat(
  folderId: string,
  query: string,
  sessionId: string,
  streamCallback?: (token: string) => void,
): Promise<ChatResponse> {
  // Load recent conversation history for context
  const recentMessages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS + 1, // +1 because the current user message was just saved
    select: { role: true, content: true },
  })
  // Reverse to chronological order, drop the last message (current query already in prompt)
  const history = recentMessages
    .reverse()
    .slice(0, -1)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const retrieval = await retrieve(query, folderId)
  const generated = await generateAnswer(query, retrieval, history, streamCallback)

  const response: ChatResponse = {
    messageId: generateId(),
    sessionId,
    answer: generated.answer,
    citations: generated.citations,
    metadata: generated.metadata,
    debug: retrieval.debugInfo,
  }

  await saveAssistantMessage(sessionId, response)

  return response
}
