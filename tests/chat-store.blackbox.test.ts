import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { useChatStore } from '@/store/chat-store'

describe('blackbox: chat store public behavior', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeFolderId: null,
      sessionId: null,
      messages: [],
      isStreaming: false,
      currentCitations: [],
    })
  })

  it('adds and updates messages through public actions', () => {
    const message = {
      id: 'message-1',
      role: 'user' as const,
      content: 'Hello',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    useChatStore.getState().addMessage(message)
    useChatStore.getState().updateMessage('message-1', { content: 'Updated' })

    assert.deepEqual(
      useChatStore.getState().messages.map((item) => item.content),
      ['Updated'],
    )
  })

  it('clears messages and session without changing the active folder', () => {
    useChatStore.getState().setActiveFolderId('folder-1')
    useChatStore.getState().setSessionId('session-1')
    useChatStore.getState().addMessage({
      id: 'message-1',
      role: 'assistant',
      content: 'Answer',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    useChatStore.getState().clearMessages()

    assert.equal(useChatStore.getState().activeFolderId, 'folder-1')
    assert.equal(useChatStore.getState().sessionId, null)
    assert.deepEqual(useChatStore.getState().messages, [])
  })
})
