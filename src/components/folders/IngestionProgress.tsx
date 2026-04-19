'use client'

import { CheckCircle2, Loader2, AlertCircle, File, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Progress } from '@/components/ui/progress'
import { listContainer, listItem } from '@/constants/animations'
import { cn } from '@/lib/utils'
import type { DriveFile, IngestionProgress as IngestionProgressType } from '@/types'

interface IngestionProgressProps {
  progress: IngestionProgressType
  files: DriveFile[]
}

const fileStatusIcon: Record<DriveFile['status'], React.ElementType> = {
  indexed: CheckCircle2,
  parsing: Loader2,
  pending: Clock,
  error: AlertCircle,
  skipped: File,
}

const fileStatusColor: Record<DriveFile['status'], string> = {
  indexed: 'text-emerald-400',
  parsing: 'text-indigo-400',
  pending: 'text-zinc-600',
  error: 'text-red-400',
  skipped: 'text-zinc-600',
}

export function IngestionProgress({ progress, files }: IngestionProgressProps) {
  const { total, parsed, indexed, failed } = progress.progress
  const pct = total > 0 ? Math.round((indexed / total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 font-medium">
          {progress.status === 'indexed' ? 'Indexing complete' : 'Indexing…'}
        </span>
        <span className="text-zinc-500 tabular-nums">
          {indexed}/{total} files
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={pct} />

      {/* Current file */}
      {progress.currentFile && progress.status === 'ingesting' && (
        <motion.div
          key={progress.currentFile}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-xs text-zinc-500"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="w-3 h-3 text-indigo-500" />
          </motion.div>
          <span className="truncate">{progress.currentFile}</span>
        </motion.div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          {files.map((file) => {
            const Icon = fileStatusIcon[file.status]
            const colorClass = fileStatusColor[file.status]

            return (
              <motion.div
                key={file.id}
                variants={listItem}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/50 transition-colors"
              >
                {file.status === 'parsing' ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  >
                    <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', colorClass)} />
                  </motion.div>
                ) : (
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', colorClass)} />
                )}
                <span className="text-xs text-zinc-400 truncate flex-1">
                  {file.name}
                </span>
                {file.status === 'error' && file.errorMessage && (
                  <span className="text-[10px] text-red-400/70 truncate max-w-[100px]">
                    {file.errorMessage}
                  </span>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Summary when done */}
      {progress.status === 'indexed' && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {indexed} files indexed successfully
          {failed > 0 && (
            <span className="text-red-400 ml-1">· {failed} failed</span>
          )}
        </motion.div>
      )}
    </div>
  )
}
