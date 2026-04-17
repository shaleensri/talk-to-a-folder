'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { getMockResponse } from '@/lib/mock-data'
import { generateId } from '@/lib/utils'
import type { ChatMessage } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

interface UseChatResult {
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => void
}

/** Simulate word-by-word streaming for the mock demo */
async function* mockStream(text: string): AsyncGenerator<string> {
  const tokens = text.split(/(\s+)/)
  for (const token of tokens) {
    yield token
    const delay = token.includes('\n') ? 60 : Math.random() * 30 + 15
    await new Promise((r) => setTimeout(r, delay))
  }
}

/**
 * Per-tab chat hook. Pass the active tab id — all state and
 * operations are scoped to that tab in the store.
 */
export function useChat(tabId: string | null): UseChatResult {
  const {
    tabs,
    addMessage,
    updateMessage,
    setTabSessionId,
    setTabStreaming,
    setTabCitations,
  } = useChatStore()
  const { setRightPanelTab } = useUIStore()
  const abortRef = useRef<AbortController | null>(null)

  const activeTab = tabs.find((t) => t.id === tabId) ?? null

  const sendMessage = useCallback(
    async (content: string) => {
      if (!tabId || !activeTab || activeTab.isStreaming) return

      const { folderIds, sessionId } = activeTab

      // 1. Add user message immediately
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        createdAt: new Date(),
      }
      addMessage(tabId, userMsg)

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
      addMessage(tabId, assistantMsg)
      setTabStreaming(tabId, true)

      try {
        if (IS_MOCK) {
          const mockResponse = getMockResponse(content)
          let streamed = ''
          for await (const token of mockStream(mockResponse.answer)) {
            streamed += token
            updateMessage(tabId, assistantId, { streamedContent: streamed })
          }
          updateMessage(tabId, assistantId, {
            content: mockResponse.answer,
            streamedContent: undefined,
            isStreaming: false,
            citations: mockResponse.citations,
            metadata: mockResponse.metadata,
            debugInfo: mockResponse.debugInfo,
          })
          setTabCitations(tabId, mockResponse.citations)
          if (mockResponse.citations.length > 0) setRightPanelTab('sources')
        } else {
          // Real API: SSE streaming
          abortRef.current = new AbortController()

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderIds, message: content, sessionId }),
            signal: abortRef.current.signal,
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error ?? 'Chat request failed')
          }

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
                  updateMessage(tabId, assistantId, { streamedContent: streamed })
                } else if (chunk.type === 'citations') {
                  finalCitations = chunk.payload
                } else if (chunk.type === 'metadata') {
                  finalMetadata = chunk.payload
                } else if (chunk.type === 'debug') {
                  finalDebug = chunk.payload
                } else if (chunk.type === 'done') {
                  setTabSessionId(tabId, chunk.payload.sessionId)
                } else if (chunk.type === 'error') {
                  toast.error(chunk.payload)
                }
              } catch {
                // Ignore parse errors in stream
              }
            }
          }

          updateMessage(tabId, assistantId, {
            content: streamed,
            streamedContent: undefined,
            isStreaming: false,
            citations: finalCitations,
            metadata: finalMetadata,
            debugInfo: finalDebug,
          })

          if (finalCitations && finalCitations.length > 0) {
            setTabCitations(tabId, finalCitations)
            setRightPanelTab('sources')
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(tabId, assistantId, { isStreaming: false, streamedContent: undefined })
        } else {
          const message = err instanceof Error ? err.message : 'Something went wrong'
          toast.error(message)
          updateMessage(tabId, assistantId, {
            content: 'Something went wrong. Please try again.',
            isStreaming: false,
            streamedContent: undefined,
          })
        }
      } finally {
        setTabStreaming(tabId, false)
        abortRef.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabId, activeTab?.folderIds, activeTab?.sessionId, activeTab?.isStreaming],
  )

  function stopStreaming() {
    abortRef.current?.abort()
  }

  return {
    messages: activeTab?.messages ?? [],
    isStreaming: activeTab?.isStreaming ?? false,
    sendMessage,
    stopStreaming,
  }
}
