'use client'

import { create } from 'zustand'
import type { ChatMessage, Citation } from '@/types'

interface ChatStore {
  // Active session
  activeFolderId: string | null
  setActiveFolderId: (id: string | null) => void

  sessionId: string | null
  setSessionId: (id: string | null) => void

  // Messages
  messages: ChatMessage[]
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  clearMessages: () => void

  // Streaming state
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void

  // Current answer citations (for right panel sync)
  currentCitations: Citation[]
  setCurrentCitations: (citations: Citation[]) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  activeFolderId: null,
  setActiveFolderId: (id) => set({ activeFolderId: id }),

  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),

  messages: [],
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),
  clearMessages: () => set({ messages: [], sessionId: null }),

  isStreaming: false,
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  currentCitations: [],
  setCurrentCitations: (citations) => set({ currentCitations: citations }),
}))
