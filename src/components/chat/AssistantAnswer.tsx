'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, AlertTriangle, ChevronDown } from 'lucide-react'
import { CitationBadge } from './CitationBadge'
import { AnswerMetadata } from './AnswerMetadata'
import { SourceCard } from '@/components/sources/SourceCard'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { messageCard } from '@/constants/animations'
import { cn } from '@/lib/utils'
import type { ChatMessage, Citation } from '@/types'

interface AssistantAnswerProps {
  message: ChatMessage
}

/**
 * Parses text like "**Bold term**: some detail [1] and more [2]..." into React nodes,
 * rendering **bold** as <strong> and [N] as CitationBadge components.
 */
function parseWithCitations(
  text: string,
  citations: Citation[],
): React.ReactNode[] {
  // Split on both **bold** markers and [N] citation markers in one pass
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g)
  return parts.map((part, i) => {
    // Inline bold: **text**
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/)
    if (boldMatch) {
      return (
        <strong key={`b-${i}`} className="font-semibold text-zinc-100">
          {boldMatch[1]}
        </strong>
      )
    }
    // Citation badge: [N]
    const citMatch = part.match(/^\[(\d+)\]$/)
    if (citMatch) {
      const index = parseInt(citMatch[1])
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

        // Standalone bold line (e.g. "**Section Header**") — render as a section label
        if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
          return (
            <p key={lineIdx} className="text-sm font-semibold text-zinc-200 mt-3 mb-0.5">
              {line.trim().slice(2, -2)}
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

// ── Inline sources toggle ───────────────────────────────────────────────────

function InlineSources({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false)
  if (citations.length === 0) return null

  return (
    <div className="mt-3 border-t border-white/[0.05] pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <ChevronDown
          className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')}
        />
        {citations.length} {citations.length === 1 ? 'source' : 'sources'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 overflow-x-hidden">
              {citations.map((citation) => (
                <SourceCard key={citation.id} citation={citation} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main AssistantAnswer ─────────────────────────────────────────────────────

export function AssistantAnswer({ message }: AssistantAnswerProps) {
  const isUnsupported = message.metadata?.confidence === 'unsupported'
  const isOffTopic = message.metadata?.confidence === 'off_topic'
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
      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border border-indigo-500/25 flex items-center justify-center mt-0.5 shadow-[0_0_12px_rgba(99,102,241,0.12)]">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
      </div>

      {/* Card */}
      <div
        className={cn(
          'flex-1 min-w-0 rounded-xl border px-4 py-3.5',
          'transition-shadow duration-200',
          isUnsupported && !isOffTopic
            ? 'border-white/[0.05] bg-zinc-900/30'
            : 'border-l-2 border-l-indigo-500/35 border-t border-r border-b border-white/[0.06] bg-zinc-900/80 backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.04)_inset] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.6),0_1px_0_rgba(255,255,255,0.04)_inset] transition-shadow duration-300',
        )}
      >
        {/* Unsupported answer banner — not shown for off_topic */}
        {isUnsupported && !isOffTopic && (
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

        {/* Inline sources — collapsible, only when done streaming */}
        {!message.isStreaming && (
          <InlineSources citations={message.citations ?? []} />
        )}
      </div>
    </motion.div>
  )
}
