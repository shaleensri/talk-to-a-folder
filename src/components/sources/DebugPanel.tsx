'use client'

import { Zap, Database, CheckCircle2, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { ChunkCard } from './ChunkCard'
import { listContainer, listItem } from '@/constants/animations'
import { cn } from '@/lib/utils'
import type { RetrievalDebugInfo } from '@/types'

interface DebugPanelProps {
  debug: RetrievalDebugInfo | null
}

export function DebugPanel({ debug }: DebugPanelProps) {
  if (!debug) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4">
        <Database className="w-5 h-5 text-zinc-700 mb-2" />
        <p className="text-xs text-zinc-600">
          Ask a question to see retrieval details
        </p>
      </div>
    )
  }

  const selectedCount = debug.selectedChunkIds.length
  const rejectedCount = debug.totalRetrieved - selectedCount

  return (
    <motion.div
      variants={listContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4 p-3"
    >
      {/* Stats row */}
      <motion.div variants={listItem} className="grid grid-cols-3 gap-2">
        {[
          {
            label: 'Retrieved',
            value: debug.totalRetrieved,
            icon: Database,
            color: 'text-zinc-400',
          },
          {
            label: 'Used',
            value: selectedCount,
            icon: CheckCircle2,
            color: 'text-emerald-400',
          },
          {
            label: 'Latency',
            value: `${debug.totalLatencyMs}ms`,
            icon: Zap,
            color: 'text-indigo-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-center"
          >
            <stat.icon className={cn('w-3.5 h-3.5 mx-auto mb-1', stat.color)} />
            <div className={cn('text-sm font-semibold tabular-nums', stat.color)}>
              {stat.value}
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Query */}
      <motion.div variants={listItem} className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Query
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
          "{debug.query}"
        </p>
      </motion.div>

      {/* Latency breakdown */}
      <motion.div variants={listItem} className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Latency breakdown
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-1.5">
            <p className="text-[10px] text-zinc-600">Retrieval</p>
            <p className="text-xs font-mono text-zinc-400">{debug.retrievalLatencyMs}ms</p>
          </div>
          <div className="rounded-md border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-1.5">
            <p className="text-[10px] text-zinc-600">Generation</p>
            <p className="text-xs font-mono text-zinc-400">{debug.generationLatencyMs}ms</p>
          </div>
        </div>
      </motion.div>

      {/* Chunks — selected first, then rejected */}
      <motion.div variants={listItem} className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Retrieved chunks
          </p>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-emerald-500">{selectedCount} used</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-600">{rejectedCount} excluded</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {debug.retrievedChunks.map((chunk) => (
            <ChunkCard key={chunk.chunkId} chunk={chunk} rank={chunk.rank} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
