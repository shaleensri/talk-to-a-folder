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

export async function chat(
  folderId: string,
  query: string,
  sessionId: string,
  streamCallback?: (token: string) => void,
): Promise<ChatResponse> {
  const retrieval = await retrieve(query, folderId)
  const generated = await generateAnswer(query, retrieval, streamCallback)

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
