'use client'

import { useUIStore } from '@/store/ui-store'
import type { Citation } from '@/types'

/**
 * Convenience hook for components that participate in citation ↔ source sync.
 *
 * For CitationBadge: call highlight(id) on hover, highlight(null) on leave.
 * For SourceCard: read isHighlighted to apply visual state.
 */
export function useSourceHighlight(citationId: string) {
  const { highlightedCitationId, setHighlightedCitationId, expandedSourceId, setExpandedSourceId } =
    useUIStore()

  const isHighlighted = highlightedCitationId === citationId
  const isExpanded = expandedSourceId === citationId

  function highlight() {
    setHighlightedCitationId(citationId)
  }

  function unhighlight() {
    setHighlightedCitationId(null)
  }

  function expand() {
    setExpandedSourceId(citationId)
  }

  function collapse() {
    setExpandedSourceId(null)
  }

  function toggleExpand() {
    setExpandedSourceId(isExpanded ? null : citationId)
  }

  return {
    isHighlighted,
    isExpanded,
    highlight,
    unhighlight,
    expand,
    collapse,
    toggleExpand,
  }
}
