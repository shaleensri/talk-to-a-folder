import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOrCreateSession, saveUserMessage, chat } from '@/services/chat-service'
import { getFolderById } from '@/services/folder-service'
import type { ChatRequest, StreamChunk } from '@/types'

// ---------------------------------------------------------------------------
// In-memory rate limiter — 20 requests per user per 60 seconds
// ---------------------------------------------------------------------------
const RATE_LIMIT = 20
const WINDOW_MS = 60_000

const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now })
    return { allowed: true, retryAfterMs: 0 }
  }

  if (entry.count >= RATE_LIMIT) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart)
    return { allowed: false, retryAfterMs }
  }

  entry.count++
  return { allowed: true, retryAfterMs: 0 }
}

/**
 * POST /api/chat
 * Streams an SSE response with token, citations, metadata, and debug chunks.
 *
 * SSE format: each line is `data: <JSON StreamChunk>\n\n`
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { allowed, retryAfterMs } = checkRateLimit(session.user.id)
  if (!allowed) {
    const seconds = Math.ceil(retryAfterMs / 1000)
    return new Response(
      JSON.stringify({ error: `Rate limit exceeded. Try again in ${seconds}s.` }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(seconds),
        },
      },
    )
  }

  let body: ChatRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.folderIds?.length || !body.message?.trim()) {
    return new Response(JSON.stringify({ error: 'folderIds and message are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify all folders belong to this user and are indexed
  const folders = await Promise.all(
    body.folderIds.map((id) => getFolderById(id, session.user.id)),
  )
  if (folders.some((f) => !f)) {
    return new Response(JSON.stringify({ error: 'One or more folders not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (folders.some((f) => f!.status !== 'indexed')) {
    return new Response(
      JSON.stringify({ error: 'All folders must be fully indexed before chatting.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const sessionId = await getOrCreateSession(body.folderIds, session.user.id, body.sessionId)
  await saveUserMessage(sessionId, body.message.trim())

  // Build the SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(chunk: StreamChunk) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }

      try {
        // Stream tokens as they arrive from OpenAI
        const response = await chat(
          body.folderIds,
          body.message.trim(),
          sessionId,
          (token) => {
            send({ type: 'token', payload: token })
          },
        )

        // After streaming completes, send structured data
        send({ type: 'citations', payload: response.citations })
        send({ type: 'metadata', payload: response.metadata })
        send({ type: 'debug', payload: response.debug })
        send({ type: 'done', payload: { messageId: response.messageId, sessionId } })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Chat failed'
        console.error('[POST /api/chat]', err)
        send({ type: 'error', payload: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
