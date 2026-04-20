'use client'

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ChatMessage, Citation, ChatTab, QuotedContext } from '@/types'

interface HistorySession {
  id: string
  folderIds: string[]
  messages: ChatMessage[]
}

interface ChatStore {
  tabs: ChatTab[]
  activeTabId: string | null

  // Tab lifecycle
  addTab: (folderIds: string[]) => string  // returns new tab id
  closeTab: (tabId: string) => void
  setActiveTabId: (id: string | null) => void

  // Restore tabs from persisted DB history (only if no tabs are open yet)
  loadFromHistory: (sessions: HistorySession[]) => void

  // Per-tab message operations
  addMessage: (tabId: string, message: ChatMessage) => void
  updateMessage: (tabId: string, id: string, updates: Partial<ChatMessage>) => void

  // Per-tab state
  setTabSessionId: (tabId: string, sessionId: string) => void
  setTabStreaming: (tabId: string, streaming: boolean) => void
  setTabCitations: (tabId: string, citations: Citation[]) => void

  // Per-tab folder management
  addFolderToTab: (tabId: string, folderId: string) => void
  removeFolderFromTab: (tabId: string, folderId: string) => void

  // Quoted text (from document viewer text selection)
  setTabQuotedText: (tabId: string, ctx: QuotedContext | null) => void
}

function updateTab(
  tabs: ChatTab[],
  tabId: string,
  updater: (tab: ChatTab) => ChatTab,
): ChatTab[] {
  return tabs.map((t) => (t.id === tabId ? updater(t) : t))
}

export const useChatStore = create<ChatStore>((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (folderIds) => {
    const id = nanoid()
    const newTab: ChatTab = {
      id,
      sessionId: null,
      folderIds,
      messages: [],
      isStreaming: false,
      currentCitations: [],
      quotedText: null,
    }
    set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }))
    return id
  },

  closeTab: (tabId) =>
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== tabId)
      const activeTabId =
        s.activeTabId === tabId
          ? (remaining[remaining.length - 1]?.id ?? null)
          : s.activeTabId
      return { tabs: remaining, activeTabId }
    }),

  setActiveTabId: (id) => set({ activeTabId: id }),

  loadFromHistory: (sessions) =>
    set((s) => {
      // Don't overwrite tabs the user has already opened in this session
      if (s.tabs.length > 0) return s
      if (sessions.length === 0) return s

      const tabs: ChatTab[] = sessions.map((session) => {
        const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant')
        return {
          id: nanoid(),
          sessionId: session.id,
          folderIds: session.folderIds,
          messages: session.messages,
          isStreaming: false,
          currentCitations: lastAssistant?.citations ?? [],
          quotedText: null,
        }
      })

      return { tabs, activeTabId: tabs[0].id }
    }),

  addMessage: (tabId, message) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({
        ...t,
        messages: [...t.messages, message],
      })),
    })),

  updateMessage: (tabId, id, updates) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      })),
    })),

  setTabSessionId: (tabId, sessionId) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, sessionId })),
    })),

  setTabStreaming: (tabId, isStreaming) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, isStreaming })),
    })),

  setTabCitations: (tabId, citations) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, currentCitations: citations })),
    })),

  addFolderToTab: (tabId, folderId) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) =>
        t.folderIds.includes(folderId)
          ? t
          : { ...t, folderIds: [...t.folderIds, folderId] },
      ),
    })),

  removeFolderFromTab: (tabId, folderId) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) =>
        t.folderIds.length <= 1
          ? t  // never remove last folder
          : { ...t, folderIds: t.folderIds.filter((id) => id !== folderId) },
      ),
    })),

  setTabQuotedText: (tabId, ctx) =>
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, quotedText: ctx })),
    })),
})
)
