'use client'

import { CheckCircle2, AlertCircle, Info, Zap, Files } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { AnswerMetadata } from '@/types'

interface AnswerMetadataProps {
  metadata: AnswerMetadata
}

const confidenceConfig = {
  high: {
    label: 'High confidence',
    icon: CheckCircle2,
    className: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
  },
  medium: {
    label: 'Medium confidence',
    icon: Info,
    className: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
  },
  low: {
    label: 'Low confidence',
    icon: AlertCircle,
    className: 'text-red-400 border-red-500/20 bg-red-500/5',
  },
  unsupported: {
    label: 'Not in folder',
    icon: AlertCircle,
    className: 'text-zinc-500 border-zinc-700 bg-zinc-800/50',
  },
  off_topic: {
    label: 'Not in folder',
    icon: AlertCircle,
    className: 'text-zinc-500 border-zinc-700 bg-zinc-800/50',
  },
}

export function AnswerMetadata({ metadata }: AnswerMetadataProps) {
  const config = confidenceConfig[metadata.confidence]
  const Icon = config.icon

  if (metadata.confidence === 'unsupported' || metadata.confidence === 'off_topic') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.2 }}
      className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/60 flex-wrap"
    >
      {/* Confidence */}
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
          config.className,
        )}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </div>

      {/* Files used */}
      {metadata.filesUsed > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
          <Files className="w-3 h-3 text-zinc-500" />
          Synthesized from {metadata.filesUsed} file{metadata.filesUsed !== 1 ? 's' : ''}
        </div>
      )}

      {/* Latency */}
      <div className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800/50 px-2 py-1 text-xs text-zinc-600">
        <Zap className="w-3 h-3" />
        {metadata.latencyMs}ms
      </div>
    </motion.div>
  )
}
