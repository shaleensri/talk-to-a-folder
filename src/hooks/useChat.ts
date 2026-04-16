'use client'

import { useCallback, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { getMockResponse } from '@/lib/mock-data'
import { generateId } from '@/lib/utils'
import type { ChatMessage } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

interface UseChatResult {
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (content: string, folderId: string) => Promise<void>
  stopStreaming: () => void
}

/** Simulate word-by-word streaming for the mock demo */
async function* mockStream(text: string): AsyncGenerator<string> {
  // Stream word by word, but group punctuation
  const tokens = text.split(/(\s+)/)
  for (const token of tokens) {
    yield token
    // Slightly variable delay for natural feel
    const delay = token.includes('\n') ? 60 : Math.random() * 30 + 15
    await new Promise((r) => setTimeout(r, delay))
  }
}

export function useChat(): UseChatResult {
  const { messages, addMessage, updateMessage, isStreaming, setIsStreaming, setCurrentCitations, sessionId, setSessionId } =
    useChatStore()
  const { setRightPanelTab } = useUIStore()
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (content: string, folderId: string) => {
      if (isStreaming) return

      // 1. Add user message immediately
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        createdAt: new Date(),
      }
      addMessage(userMsg)

      // 2. Add placeholder assistant message
      const assistantId = generateId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streamedContent: '',
        isStreaming: true,
        createdAt: new Date(),
      }
      addMessage(assistantMsg)
      setIsStreaming(true)

      try {
        if (IS_MOCK) {
          // Get mock response
          const mockResponse = getMockResponse(content)

          // Stream the answer text
          let streamed = ''
          for await (const token of mockStream(mockResponse.answer)) {
            streamed += token
            updateMessage(assistantId, { streamedContent: streamed })
          }

          // Finalize
          updateMessage(assistantId, {
            content: mockResponse.answer,
            streamedContent: undefined,
            isStreaming: false,
            citations: mockResponse.citations,
            metadata: mockResponse.metadata,
            debugInfo: mockResponse.debugInfo,
          })

          setCurrentCitations(mockResponse.citations)
          if (mockResponse.citations.length > 0) {
            setRightPanelTab('sources')
          }
        } else {
          // Real API: SSE streaming
          abortRef.current = new AbortController()

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId, message: content, sessionId }),
            signal: abortRef.current.signal,
          })

          if (!res.ok) throw new Error('Chat request failed')

          const reader = res.body?.getReader()
          if (!reader) throw new Error('No response stream')

          const decoder = new TextDecoder()
          let buffer = ''
          let streamed = ''
          let finalCitations: ChatMessage['citations'] = []
          let finalMetadata: ChatMessage['metadata']
          let finalDebug: ChatMessage['debugInfo']

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6)
              if (raw === '[DONE]') break

              try {
                const chunk = JSON.parse(raw)
                if (chunk.type === 'token') {
                  streamed += chunk.payload
                  updateMessage(assistantId, { streamedContent: streamed })
                } else if (chunk.type === 'citations') {
                  finalCitations = chunk.payload
                } else if (chunk.type === 'metadata') {
                  finalMetadata = chunk.payload
                } else if (chunk.type === 'debug') {
                  finalDebug = chunk.payload
                } else if (chunk.type === 'done') {
                  setSessionId(chunk.payload.sessionId)
                }
              } catch {
                // Ignore parse errors in stream
              }
            }
          }

          updateMessage(assistantId, {
            content: streamed,
            streamedContent: undefined,
            isStreaming: false,
            citations: finalCitations,
            metadata: finalMetadata,
            debugInfo: finalDebug,
          })

          if (finalCitations && finalCitations.length > 0) {
            setCurrentCitations(finalCitations)
            setRightPanelTab('sources')
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User stopped — finalize with what we have
          updateMessage(assistantId, { isStreaming: false, streamedContent: undefined })
        } else {
          updateMessage(assistantId, {
            content: 'Something went wrong. Please try again.',
            isStreaming: false,
            streamedContent: undefined,
          })
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [isStreaming, sessionId, addMessage, updateMessage, setIsStreaming, setCurrentCitations, setSessionId, setRightPanelTab],
  )

  function stopStreaming() {
    abortRef.current?.abort()
  }

  return { messages, isStreaming, sendMessage, stopStreaming }
}
