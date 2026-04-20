import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { retrieve } from '@/lib/retrieval'
import { generateAnswer } from '@/lib/answer-generator'
import { generateId } from '@/lib/utils'
import type { ChatResponse } from '@/types'

// ---------------------------------------------------------------------------
// Query rewriting
// ---------------------------------------------------------------------------

// Contextual references that suggest the query depends on prior conversation
const CONTEXTUAL_RE =
  /\b(that|those|it|them|this|same|another|other|rest|more about|else|above|mentioned|previous|last|the file|the document|the folder|expand|elaborate|tell me more|what about|how about|what else|go deeper|more detail|the one|those files|what can i say|what should i say|what do i say|how should i answer|what to say|they ask|if asked|follow up|next question)\b/i

/**
 * If the query contains contextual references (e.g. "that file", "tell me more"),
 * uses gpt-4o-mini to rewrite it into a fully self-contained question.
 * Falls back silently to the original query on any error.
 */
async function rewriteQueryIfNeeded(
  query: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  if (history.length === 0) return query
  if (!CONTEXTUAL_RE.test(query)) return query

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const recentHistory = history.slice(-4) // last 2 turns is enough context

    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are helping a document Q&A system. ' +
            'Rewrite the user\'s latest question to be fully self-contained by resolving any pronouns or vague references ' +
            '(e.g. "that file" → the actual file name, "it" → the actual topic, "tell me more" → "tell me more about X"). ' +
            'Use only information present in the conversation history. ' +
            'Output ONLY the rewritten question — no explanation, no prefix, no quotes. ' +
            'If no rewrite is needed, output the original question unchanged.',
        },
        ...recentHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 200,
    })

    return res.choices[0]?.message?.content?.trim() || query
  } catch {
    return query // never block the chat on a rewrite failure
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function getOrCreateSession(
  folderIds: string[],
  userId?: string,
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
      ...(userId && { userId }),
      folders: {
        create: folderIds.map((folderId) => ({ folderId })),
      },
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

/**
 * Extracts the quoted text from a message formatted as:
 *   "> quoted selection\n\nuser question"
 * Returns null if the message doesn't contain a blockquote.
 */
function extractQuoteText(message: string): string | null {
  if (!message.startsWith('> ')) return null
  const boundary = message.indexOf('\n\n')
  if (boundary === -1) return null
  return message.slice(2, boundary).trim() // skip leading "> "
}

export async function chat(
  folderIds: string[],
  query: string,
  sessionId: string,
  streamCallback?: (token: string) => void,
  sourceFileId?: string,
): Promise<ChatResponse> {
  // Load recent conversation history for context
  const recentMessages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS + 1, // +1 because the current user message was just saved
    select: { role: true, content: true },
  })
  // Reverse to chronological order, drop the last message (current query already in prompt).
  // Trim assistant messages to ~400 chars so prior long answers don't crowd the LLM context —
  // we want the model to know what was discussed, not repeat it verbatim.
  const ASSISTANT_HISTORY_LIMIT = 400
  const history = recentMessages
    .reverse()
    .slice(0, -1)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content:
        m.role === 'assistant' && m.content.length > ASSISTANT_HISTORY_LIMIT
          ? m.content.slice(0, ASSISTANT_HISTORY_LIMIT) + '…'
          : m.content,
    }))

  // When the user sent a quote from a specific file, use the quoted text itself
  // as the retrieval query — not their (often short/vague) question.
  // "What's this?" embeds with no signal; the quoted passage embeds with rich signal
  // and finds the chunks adjacent to what the user is actually looking at.
  // Skip query rewriting too — the quote is already self-contained context.
  const retrievalQuery = sourceFileId
    ? (extractQuoteText(query) ?? query)
    : await rewriteQueryIfNeeded(query, history)

  const retrieval = await retrieve(retrievalQuery, folderIds, history, sourceFileId)

  // Build folder name map for multi-folder labeling
  const folderRecords = await prisma.indexedFolder.findMany({
    where: { id: { in: folderIds } },
    select: { id: true, name: true },
  })
  const folderNames = new Map(folderRecords.map((f) => [f.id, f.name]))

  // The answer generator always receives the original query so the model sees
  // the full message (blockquote + question) and knows what the user asked.
  const generated = await generateAnswer(query, retrieval, history, streamCallback, folderNames)

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
