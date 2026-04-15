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
    <div className="flex flex-col h-full min-h-0">
      <MessageList
        messages={messages}
        activeFolder={activeFolder}
        onQuestionSelect={handleQuestionSelect}
      />

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
  )
}
