import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOrCreateSession, saveUserMessage, chat } from '@/services/chat-service'
import { getFolderById } from '@/services/folder-service'
import type { ChatRequest, StreamChunk } from '@/types'

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

  let body: ChatRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.folderId || !body.message?.trim()) {
    return new Response(JSON.stringify({ error: 'folderId and message are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify the folder belongs to this user
  const folder = await getFolderById(body.folderId, session.user.id)
  if (!folder) {
    return new Response(JSON.stringify({ error: 'Folder not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (folder.status !== 'indexed') {
    return new Response(
      JSON.stringify({ error: 'Folder is not indexed yet. Please wait for ingestion to complete.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const sessionId = await getOrCreateSession(body.folderId, body.sessionId)
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
          body.folderId,
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
