'use client'

import { motion } from 'framer-motion'
import { useUIStore } from '@/store/ui-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { truncate } from '@/lib/utils'
import type { Citation } from '@/types'

interface CitationBadgeProps {
  citation: Citation
}

/**
 * Inline citation badge like [1].
 * Hover → highlights the matching SourceCard in the right panel.
 * Click → expands + scrolls to the exact chunk in the right panel.
 */
export function CitationBadge({ citation }: CitationBadgeProps) {
  const { highlightedCitationId, setHighlightedCitationId, setExpandedSourceId, setRightPanelTab } =
    useUIStore()

  const isHighlighted = highlightedCitationId === citation.id

  function handleClick() {
    setExpandedSourceId(citation.id)
    setRightPanelTab('sources')
    // Scroll to the source card via its ID
    requestAnimationFrame(() => {
      document.getElementById(`source-${citation.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          className={cn(
            'inline-flex items-center justify-center mx-0.5',
            'w-[18px] h-[18px] rounded text-[10px] font-semibold',
            'border transition-colors duration-100 cursor-pointer select-none',
            'align-middle relative -top-px',
            isHighlighted
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-glow-sm'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-300',
          )}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onHoverStart={() => setHighlightedCitationId(citation.id)}
          onHoverEnd={() => setHighlightedCitationId(null)}
          onClick={handleClick}
          aria-label={`Source ${citation.index}: ${citation.fileName}`}
        >
          {citation.index}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <div className="space-y-1">
          <div className="font-medium text-zinc-200">{citation.fileName}</div>
          <div className="text-zinc-400 leading-relaxed">
            "{truncate(citation.highlightText ?? citation.chunkText, 120)}"
          </div>
          <div className="text-zinc-600 text-[10px]">
            Relevance: {Math.round(citation.relevanceScore * 100)}%
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
