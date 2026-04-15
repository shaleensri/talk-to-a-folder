'use client'

import { CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { FolderStatus } from '@/types'

interface FolderStatusPillProps {
  status: FolderStatus
  size?: 'sm' | 'md'
}

const statusConfig: Record<
  FolderStatus,
  {
    label: string
    icon: React.ElementType
    className: string
    iconClassName?: string
    spin?: boolean
  }
> = {
  indexed: {
    label: 'Indexed',
    icon: CheckCircle2,
    className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-400',
  },
  ingesting: {
    label: 'Indexing',
    icon: Loader2,
    className: 'border-indigo-500/25 bg-indigo-500/8 text-indigo-400',
    spin: true,
  },
  idle: {
    label: 'Not indexed',
    icon: Clock,
    className: 'border-zinc-700 bg-zinc-800/50 text-zinc-500',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    className: 'border-red-500/25 bg-red-500/8 text-red-400',
  },
}

export function FolderStatusPill({ status, size = 'md' }: FolderStatusPillProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        config.className,
      )}
    >
      {config.spin ? (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="inline-flex"
        >
          <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        </motion.span>
      ) : (
        <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      )}
      {size === 'md' && config.label}
    </span>
  )
}
