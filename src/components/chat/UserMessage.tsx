'use client'

import { motion } from 'framer-motion'
import { Quote } from 'lucide-react'
import { slideUp } from '@/constants/animations'
import type { ChatMessage } from '@/types'

interface UserMessageProps {
  message: ChatMessage
}

/**
 * Splits a message that was sent with a document quote into its two parts.
 * Format: "> quoted text\n\nuser question"
 * Returns { quote, question } if a blockquote is present, otherwise { quote: null, question: content }.
 */
function parseMessage(content: string): { quote: string | null; question: string } {
  if (!content.startsWith('> ')) return { quote: null, question: content }
  const boundary = content.indexOf('\n\n')
  if (boundary === -1) return { quote: null, question: content }
  return {
    quote: content.slice(2, boundary).trim(),
    question: content.slice(boundary + 2).trim(),
  }
}

export function UserMessage({ message }: UserMessageProps) {
  const { quote, question } = parseMessage(message.content)

  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="visible"
      className="flex justify-end"
    >
      <div className="max-w-[75%] flex flex-col gap-1.5">
        {/* Quoted document excerpt — shown above the bubble */}
        {quote && (
          <div className="flex items-start gap-1.5 px-3 py-2 rounded-xl rounded-tr-sm bg-zinc-800/80 border border-zinc-700/50">
            <Quote className="w-3 h-3 text-zinc-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400 leading-relaxed italic line-clamp-4">{quote}</p>
          </div>
        )}

        {/* The actual question */}
        <div className="rounded-2xl rounded-tr-md bg-gradient-to-br from-indigo-500 to-indigo-700 px-4 py-2.5 text-sm text-white shadow-[0_4px_20px_rgba(99,102,241,0.3),0_1px_0_rgba(255,255,255,0.15)_inset] leading-relaxed">
          {question}
        </div>
      </div>
    </motion.div>
  )
}
