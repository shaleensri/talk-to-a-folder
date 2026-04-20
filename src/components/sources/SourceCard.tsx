'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store/ui-store'
import { cn, formatScore, mimeTypeToExtension } from '@/lib/utils'
import { scaleIn } from '@/constants/animations'
import type { Citation } from '@/types'

interface SourceCardProps {
  citation: Citation
  mimeType?: string
}

/**
 * Highlights a specific span of text within a longer string.
 */
function HighlightedText({
  text,
  highlight,
}: {
  text: string
  highlight?: string
}) {
  if (!highlight) return <span>{text}</span>

  const idx = text.toLowerCase().indexOf(highlight.toLowerCase())
  if (idx === -1) return <span>{text}</span>

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-indigo-500/20 text-indigo-300 rounded-sm px-0.5 not-italic">
        {text.slice(idx, idx + highlight.length)}
      </mark>
      {text.slice(idx + highlight.length)}
    </>
  )
}

export function SourceCard({ citation, mimeType }: SourceCardProps) {
  const { highlightedCitationId, expandedSourceId, setExpandedSourceId } = useUIStore()

  const isHighlighted = highlightedCitationId === citation.id
  const isExpanded = expandedSourceId === citation.id

  function toggleExpand() {
    setExpandedSourceId(isExpanded ? null : citation.id)
  }

  return (
    <motion.div
      id={`source-${citation.id}`}
      layout
      animate={
        isHighlighted
          ? { boxShadow: '0 0 0 2px rgba(99,102,241,0.35)' }
          : { boxShadow: '0 0 0 0 rgba(99,102,241,0)' }
      }
      transition={{ duration: 0.15 }}
      className={cn(
        'rounded-xl border transition-colors duration-150 overflow-hidden',
        isHighlighted
          ? 'border-indigo-500/40 bg-indigo-500/5'
          : 'border-zinc-800 bg-zinc-900',
      )}
    >
      {/* Header */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
      >
        {/* Citation index badge */}
        <span
          className={cn(
            'inline-flex items-center justify-center flex-shrink-0',
            'w-5 h-5 rounded text-[10px] font-semibold border mt-0.5',
            isHighlighted
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400',
          )}
        >
          {citation.index}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-zinc-600 flex-shrink-0" />
            <span className="text-xs font-medium text-zinc-300 truncate">
              {citation.fileName}
            </span>
          </div>
          {/* Score */}
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500/70"
                style={{ width: `${citation.relevanceScore * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-600 tabular-nums">
              {formatScore(citation.relevanceScore)} match
            </span>
          </div>
        </div>

        <span className="flex-shrink-0 mt-0.5">
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </span>
      </button>

      {/* Expanded chunk */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800/60 px-3 pb-3 pt-2.5">
              <p className="text-xs text-zinc-400 leading-relaxed break-words overflow-hidden">
                <HighlightedText
                  text={citation.chunkText}
                  highlight={citation.highlightText}
                />
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
