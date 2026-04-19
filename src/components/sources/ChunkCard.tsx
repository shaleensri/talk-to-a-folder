'use client'

import { cn, formatScore } from '@/lib/utils'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { RetrievedChunk } from '@/types'

interface ChunkCardProps {
  chunk: RetrievedChunk
  rank: number
}

export function ChunkCard({ chunk, rank }: ChunkCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 text-xs space-y-1.5 transition-colors',
        chunk.selected
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-zinc-800/60 bg-zinc-900/30 opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {chunk.selected ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-zinc-600 flex-shrink-0" />
          )}
          <span
            className={cn(
              'font-medium',
              chunk.selected ? 'text-zinc-300' : 'text-zinc-500',
            )}
          >
            #{rank} · {chunk.fileName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Score bar */}
          <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                chunk.score > 0.8
                  ? 'bg-emerald-500'
                  : chunk.score > 0.65
                  ? 'bg-indigo-500'
                  : 'bg-zinc-600',
              )}
              style={{ width: `${chunk.score * 100}%` }}
            />
          </div>
          <span
            className={cn(
              'tabular-nums font-mono',
              chunk.selected ? 'text-zinc-400' : 'text-zinc-600',
            )}
          >
            {formatScore(chunk.score)}
          </span>
        </div>
      </div>
      <p
        className={cn(
          'leading-relaxed line-clamp-3',
          chunk.selected ? 'text-zinc-500' : 'text-zinc-600',
        )}
      >
        {chunk.text}
      </p>
    </div>
  )
}
