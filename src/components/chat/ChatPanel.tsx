'use client'

import { useChat } from '@/hooks/useChat'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'
import type { IndexedFolder } from '@/types'

interface ChatPanelProps {
  activeFolder: IndexedFolder | null
}

export function ChatPanel({ activeFolder }: ChatPanelProps) {
  const { messages, isStreaming, sendMessage, stopStreaming } = useChat()

  const canChat = activeFolder?.status === 'indexed'

  function handleSend(text: string) {
    if (!activeFolder || !canChat) return
    sendMessage(text, activeFolder.id)
  }

  function handleQuestionSelect(question: string) {
    handleSend(question)
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <MessageList
        messages={messages}
        activeFolder={activeFolder}
        onQuestionSelect={handleQuestionSelect}
      />

      {/* Fade gradient so messages dissolve into the floating composer */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent z-10" />

      <div className="relative z-20">
      <ChatComposer
        onSend={handleSend}
        onStop={stopStreaming}
        isLoading={isStreaming}
        disabled={!canChat}
        placeholder={
          !activeFolder
            ? 'Select a folder to start asking questions…'
            : activeFolder.status === 'ingesting'
            ? 'Indexing in progress…'
            : 'Ask a question about your folder…'
        }
      />
      </div>
    </div>
  )
}
