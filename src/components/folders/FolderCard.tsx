'use client'

import { FolderOpen, FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import { FolderStatusPill } from './FolderStatusPill'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { IndexedFolder } from '@/types'

interface FolderCardProps {
  folder: IndexedFolder
  isActive: boolean
  onSelect: (folder: IndexedFolder) => void
}

export function FolderCard({ folder, isActive, onSelect }: FolderCardProps) {
  return (
    <motion.button
      onClick={() => onSelect(folder)}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group',
        'flex flex-col gap-1.5',
        isActive
          ? 'bg-indigo-500/10 border border-indigo-500/20 text-zinc-100'
          : 'hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200',
      )}
      whileHover={{ scale: 1.01 }}
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
      </div>

      <div className="flex items-center gap-2 pl-6">
        <FolderStatusPill status={folder.status} size="sm" />
        {folder.status === 'indexed' && (
          <span className="text-[11px] text-zinc-600">
            {folder.fileCount} files
          </span>
        )}
      </div>

      {folder.lastIndexed && folder.status === 'indexed' && (
        <span className="pl-6 text-[11px] text-zinc-700">
          {formatRelativeTime(new Date(folder.lastIndexed))}
        </span>
      )}
    </motion.button>
  )
}
