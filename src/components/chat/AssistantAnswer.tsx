'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Bot, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CitationBadge } from './CitationBadge'
import { AnswerMetadata } from './AnswerMetadata'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { messageCard } from '@/constants/animations'
import { cn } from '@/lib/utils'
import type { ChatMessage, Citation } from '@/types'

interface AssistantAnswerProps {
  message: ChatMessage
}

/**
 * Parses text like "...friction [1] and portability [2]..." into React nodes
 * with CitationBadge components in-place for each [N] marker.
 */
function parseWithCitations(
  text: string,
  citations: Citation[],
): React.ReactNode[] {
  const parts = text.split(/(\[\d+\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/)
    if (match) {
      const index = parseInt(match[1])
      const citation = citations.find((c) => c.index === index)
      if (citation) {
        return <CitationBadge key={`cit-${i}`} citation={citation} />
      }
    }
    return part
  })
}

/**
 * Custom markdown renderer that injects citation badges within paragraphs.
 * Each paragraph is split by citation markers before rendering.
 */
function AnswerContent({
  content,
  citations,
}: {
  content: string
  citations: Citation[]
}) {
  // Split content by paragraphs, process each for citations
  const lines = content.split('\n')

  return (
    <div className="prose-answer">
      {lines.map((line, lineIdx) => {
        // Handle markdown heading lines directly
        const headingMatch = line.match(/^(#{1,3})\s(.+)/)
        if (headingMatch) {
          const level = headingMatch[1].length
          const text = headingMatch[2]
          const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
          return (
            <Tag key={lineIdx} className={cn(
              'font-semibold text-zinc-100 mt-3 mb-1',
              level === 1 && 'text-base',
              level === 2 && 'text-sm',
              level === 3 && 'text-sm text-zinc-300',
            )}>
              {text}
            </Tag>
          )
        }

        // Bullet list items
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const itemText = line.slice(2)
          return (
            <div key={lineIdx} className="flex gap-2 text-sm text-zinc-300 leading-relaxed my-0.5">
              <span className="text-indigo-500 mt-0.5 flex-shrink-0">•</span>
              <span>{parseWithCitations(itemText, citations)}</span>
            </div>
          )
        }

        // Bold text with **
        if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
          return (
            <p key={lineIdx} className="text-sm font-semibold text-zinc-200 mt-3 mb-0.5">
              {line.slice(2, -2)}
            </p>
          )
        }

        // Empty line → spacing
        if (!line.trim()) {
          return <div key={lineIdx} className="h-2" />
        }

        // Regular paragraph — parse for citations and inline bold
        return (
          <p key={lineIdx} className="text-sm text-zinc-300 leading-relaxed">
            {parseWithCitations(line, citations)}
          </p>
        )
      })}
    </div>
  )
}

export function AssistantAnswer({ message }: AssistantAnswerProps) {
  const isUnsupported = message.metadata?.confidence === 'unsupported'
  const displayContent = message.isStreaming
    ? message.streamedContent ?? ''
    : message.content

  return (
    <motion.div
      variants={messageCard}
      initial="hidden"
      animate="visible"
      className="flex gap-3 group"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center mt-0.5">
        <Bot className="w-3.5 h-3.5 text-zinc-400" />
      </div>

      {/* Card */}
      <div
        className={cn(
          'flex-1 min-w-0 rounded-xl border px-4 py-3.5',
          'transition-shadow duration-200',
          isUnsupported
            ? 'border-zinc-800/60 bg-zinc-900/40'
            : 'border-zinc-800 bg-zinc-900 shadow-card group-hover:shadow-card-hover',
        )}
      >
        {/* Unsupported answer banner */}
        {isUnsupported && (
          <div className="flex items-center gap-2 mb-3 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Couldn't find strong evidence in the folder for this question
          </div>
        )}

        {/* Content or streaming state */}
        {message.isStreaming && !displayContent ? (
          <div className="flex items-center gap-2 h-6">
            <LoadingDots className="text-zinc-500" />
          </div>
        ) : (
          <AnswerContent
            content={displayContent}
            citations={message.citations ?? []}
          />
        )}

        {/* Streaming cursor */}
        {message.isStreaming && displayContent && (
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 align-middle"
          />
        )}

        {/* Metadata — only show when done streaming */}
        {!message.isStreaming && message.metadata && (
          <AnswerMetadata metadata={message.metadata} />
        )}
      </div>
    </motion.div>
  )
}
