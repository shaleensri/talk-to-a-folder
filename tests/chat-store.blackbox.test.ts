import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { useChatStore } from '@/store/chat-store'
import type { ChatMessage } from '@/types'

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('blackbox: chat store (tabs-based API)', () => {
  beforeEach(() => {
    useChatStore.setState({ tabs: [], activeTabId: null })
  })

  // ---------------------------------------------------------------------------
  // Tab lifecycle
  // ---------------------------------------------------------------------------

  it('addTab creates a tab with the correct initial shape and sets it active', () => {
    const id = useChatStore.getState().addTab(['folder-1', 'folder-2'])

    const { tabs, activeTabId } = useChatStore.getState()
    assert.equal(tabs.length, 1)
    assert.equal(activeTabId, id)
    assert.deepEqual(tabs[0].folderIds, ['folder-1', 'folder-2'])
    assert.deepEqual(tabs[0].messages, [])
    assert.equal(tabs[0].isStreaming, false)
    assert.equal(tabs[0].sessionId, null)
    assert.equal(tabs[0].quotedText, null)
  })

  it('addTab returns the new tab id as a non-empty string', () => {
    const id = useChatStore.getState().addTab(['folder-1'])
    assert.equal(typeof id, 'string')
    assert.equal(id.length > 0, true)
  })

  it('opening multiple tabs keeps all of them and activates the latest', () => {
    const id1 = useChatStore.getState().addTab(['folder-1'])
    const id2 = useChatStore.getState().addTab(['folder-2'])

    const { tabs, activeTabId } = useChatStore.getState()
    assert.equal(tabs.length, 2)
    assert.equal(activeTabId, id2)
    assert.notEqual(id1, id2)
  })

  it('closeTab removes the tab and falls back to the previous tab as active', () => {
    const id1 = useChatStore.getState().addTab(['folder-1'])
    const id2 = useChatStore.getState().addTab(['folder-2'])

    useChatStore.getState().closeTab(id2)

    const { tabs, activeTabId } = useChatStore.getState()
    assert.equal(tabs.length, 1)
    assert.equal(tabs[0].id, id1)
    assert.equal(activeTabId, id1)
  })

  it('closing the last tab sets activeTabId to null', () => {
    const id = useChatStore.getState().addTab(['folder-1'])
    useChatStore.getState().closeTab(id)

    assert.equal(useChatStore.getState().tabs.length, 0)
    assert.equal(useChatStore.getState().activeTabId, null)
  })

  it('setActiveTabId switches the active tab without modifying the tab list', () => {
    useChatStore.getState().addTab(['folder-1'])
    const id2 = useChatStore.getState().addTab(['folder-2'])
    const id1 = useChatStore.getState().tabs[0].id

    useChatStore.getState().setActiveTabId(id1)

    assert.equal(useChatStore.getState().activeTabId, id1)
    assert.equal(useChatStore.getState().tabs.length, 2)
    // switch back
    useChatStore.getState().setActiveTabId(id2)
    assert.equal(useChatStore.getState().activeTabId, id2)
  })

  // ---------------------------------------------------------------------------
  // Per-tab messages
  // ---------------------------------------------------------------------------

  it('addMessage appends a message to the correct tab only', () => {
    const id1 = useChatStore.getState().addTab(['folder-1'])
    const id2 = useChatStore.getState().addTab(['folder-2'])

    useChatStore.getState().addMessage(id1, makeMessage({ id: 'msg-a', content: 'Tab 1 message' }))
    useChatStore.getState().addMessage(id2, makeMessage({ id: 'msg-b', content: 'Tab 2 message' }))

    const tab1 = useChatStore.getState().tabs.find((t) => t.id === id1)!
    const tab2 = useChatStore.getState().tabs.find((t) => t.id === id2)!

    assert.equal(tab1.messages.length, 1)
    assert.equal(tab1.messages[0].content, 'Tab 1 message')
    assert.equal(tab2.messages.length, 1)
    assert.equal(tab2.messages[0].content, 'Tab 2 message')
  })

  it('updateMessage patches the correct message within the correct tab', () => {
    const id = useChatStore.getState().addTab(['folder-1'])
    useChatStore.getState().addMessage(id, makeMessage({ id: 'msg-1', content: 'Original' }))

    useChatStore.getState().updateMessage(id, 'msg-1', { content: 'Updated', role: 'assistant' })

    const msg = useChatStore.getState().tabs[0].messages[0]
    assert.equal(msg.content, 'Updated')
    assert.equal(msg.role, 'assistant')
    assert.equal(msg.id, 'msg-1')
  })

  // ---------------------------------------------------------------------------
  // Per-tab state helpers
  // ---------------------------------------------------------------------------

  it('setTabSessionId updates the sessionId for the correct tab', () => {
    const id = useChatStore.getState().addTab(['folder-1'])
    useChatStore.getState().setTabSessionId(id, 'session-abc')

    assert.equal(useChatStore.getState().tabs[0].sessionId, 'session-abc')
  })

  it('setTabStreaming toggles streaming state without touching other tabs', () => {
    const id1 = useChatStore.getState().addTab(['folder-1'])
    const id2 = useChatStore.getState().addTab(['folder-2'])

    useChatStore.getState().setTabStreaming(id1, true)

    const tab1 = useChatStore.getState().tabs.find((t) => t.id === id1)!
    const tab2 = useChatStore.getState().tabs.find((t) => t.id === id2)!
    assert.equal(tab1.isStreaming, true)
    assert.equal(tab2.isStreaming, false)
  })

  it('setTabQuotedText stores and clears the quoted context', () => {
    const id = useChatStore.getState().addTab(['folder-1'])
    const ctx = { text: 'Selected passage', fileId: 'file-abc' }

    useChatStore.getState().setTabQuotedText(id, ctx)
    assert.deepEqual(useChatStore.getState().tabs[0].quotedText, ctx)

    useChatStore.getState().setTabQuotedText(id, null)
    assert.equal(useChatStore.getState().tabs[0].quotedText, null)
  })

  // ---------------------------------------------------------------------------
  // Folder management
  // ---------------------------------------------------------------------------

  it('addFolderToTab appends a folder id and is idempotent', () => {
    const id = useChatStore.getState().addTab(['folder-1'])

    useChatStore.getState().addFolderToTab(id, 'folder-2')
    useChatStore.getState().addFolderToTab(id, 'folder-2') // duplicate — no-op

    assert.deepEqual(useChatStore.getState().tabs[0].folderIds, ['folder-1', 'folder-2'])
  })

  it('removeFolderFromTab removes a folder but never drops the last one', () => {
    const id = useChatStore.getState().addTab(['folder-1', 'folder-2'])

    useChatStore.getState().removeFolderFromTab(id, 'folder-1')
    assert.deepEqual(useChatStore.getState().tabs[0].folderIds, ['folder-2'])

    // Attempting to remove the last folder is a no-op
    useChatStore.getState().removeFolderFromTab(id, 'folder-2')
    assert.deepEqual(useChatStore.getState().tabs[0].folderIds, ['folder-2'])
  })

  // ---------------------------------------------------------------------------
  // History restore
  // ---------------------------------------------------------------------------

  it('loadFromHistory restores sessions as tabs when no tabs are open', () => {
    useChatStore.getState().loadFromHistory([
      {
        id: 'session-1',
        folderIds: ['folder-1'],
        messages: [makeMessage({ id: 'msg-1', role: 'user', content: 'Hi' })],
      },
      {
        id: 'session-2',
        folderIds: ['folder-2'],
        messages: [],
      },
    ])

    const { tabs, activeTabId } = useChatStore.getState()
    assert.equal(tabs.length, 2)
    assert.equal(tabs[0].sessionId, 'session-1')
    assert.equal(tabs[0].messages[0].content, 'Hi')
    assert.equal(tabs[1].sessionId, 'session-2')
    assert.equal(activeTabId, tabs[0].id)
  })

  it('loadFromHistory is a no-op when tabs are already open', () => {
    const existingId = useChatStore.getState().addTab(['folder-existing'])

    useChatStore.getState().loadFromHistory([
      { id: 'session-new', folderIds: ['folder-other'], messages: [] },
    ])

    const { tabs } = useChatStore.getState()
    assert.equal(tabs.length, 1)
    assert.equal(tabs[0].id, existingId) // unchanged
  })
})
