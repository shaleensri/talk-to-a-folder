'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { UserMessage } from './UserMessage'
import { AssistantAnswer } from './AssistantAnswer'
import { EmptyChat } from './EmptyChat'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChatMessage, IndexedFolder } from '@/types'

interface MessageListProps {
  messages: ChatMessage[]
  activeFolder: IndexedFolder | null
  onQuestionSelect: (q: string) => void
}

export function MessageList({ messages, activeFolder, onQuestionSelect }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <EmptyChat activeFolder={activeFolder} onQuestionSelect={onQuestionSelect} />
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-5 px-4 py-6 max-w-3xl mx-auto">
        <AnimatePresence initial={false}>
          {messages.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} message={message} />
            ) : (
              <AssistantAnswer key={message.id} message={message} />
            ),
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
