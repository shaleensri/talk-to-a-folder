'use client'

import { FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { FolderStatusPill } from './FolderStatusPill'
import { TiltCard } from '@/components/ui/TiltCard'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { IndexedFolder } from '@/types'

interface FolderCardProps {
  folder: IndexedFolder
  isActive: boolean
  onSelect: (folder: IndexedFolder) => void
  onReindex?: (folder: IndexedFolder) => void
  onDelete?: (folder: IndexedFolder) => void
}

export function FolderCard({ folder, isActive, onSelect, onReindex, onDelete }: FolderCardProps) {
  const [reindexing, setReindexing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleReindex(e: React.MouseEvent) {
    e.stopPropagation()
    setReindexing(true)
    try {
      await fetch(`/api/folders/${folder.id}/ingest`, { method: 'POST' })

      // Poll until ingestion finishes, then refresh the folder list
      const poll = async (): Promise<void> => {
        const res = await fetch(`/api/folders/${folder.id}/status`)
        const data = await res.json()
        const status = data.status?.status ?? data.status
        if (status === 'indexed' || status === 'error') {
          onReindex?.(folder)
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
        return poll()
      }
      await poll()
    } finally {
      setReindexing(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' })
      onDelete?.(folder)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <TiltCard strength={4} scaleOnHover={1.0} className="rounded-lg w-full">
    <motion.button
      onClick={() => onSelect(folder)}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group',
        'flex flex-col gap-1.5',
        isActive
          ? 'bg-gradient-to-r from-indigo-500/10 to-violet-500/5 border border-indigo-500/25 text-zinc-100 shadow-[0_0_20px_rgba(99,102,241,0.06)]'
          : 'hover:bg-zinc-900/80 border border-transparent hover:border-white/[0.06] text-zinc-400 hover:text-zinc-200',
      )}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="flex items-start gap-2">
        <FolderOpen
          className={cn(
            'w-4 h-4 mt-0.5 flex-shrink-0 transition-colors',
            isActive ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-zinc-400',
          )}
        />
        <span className="text-sm font-medium leading-snug line-clamp-2 flex-1">
          {folder.name}
        </span>
        {confirmDelete ? (
          <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Confirm'}
            </button>
            <span className="text-zinc-700">·</span>
            <button
              onClick={handleCancelDelete}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 pl-6">
        <FolderStatusPill status={folder.status} size="sm" />
        {folder.status === 'indexed' && (
          <span className="text-[11px] text-zinc-600">
            {folder.fileCount} files
          </span>
        )}
        {folder.status !== 'ingesting' && (
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', reindexing && 'animate-spin')} />
            {reindexing ? 'Indexing…' : folder.status === 'indexed' ? 'Re-index' : 'Index now'}
          </button>
        )}
      </div>

      {folder.lastIndexed && folder.status === 'indexed' && (
        <span className="pl-6 text-[11px] text-zinc-700">
          {formatRelativeTime(new Date(folder.lastIndexed))}
        </span>
      )}
    </motion.button>
    </TiltCard>
  )
}
