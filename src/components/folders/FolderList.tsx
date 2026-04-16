'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { FolderCard } from './FolderCard'
import { Skeleton } from '@/components/ui/skeleton'
import { listContainer, listItem } from '@/constants/animations'
import type { IndexedFolder } from '@/types'

interface FolderListProps {
  folders: IndexedFolder[]
  activeFolderId: string | null
  onSelect: (folder: IndexedFolder) => void
  onReindex?: (folder: IndexedFolder) => void
  onDelete?: (folder: IndexedFolder) => void
  isLoading?: boolean
}

export function FolderList({ folders, activeFolderId, onSelect, onReindex, onDelete, isLoading }: FolderListProps) {
  if (isLoading) {
    return (
      <div className="px-2 space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-3 py-2.5 space-y-2">
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-3 w-[50%]" />
          </div>
        ))}
      </div>
    )
  }

  if (folders.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-zinc-600">No folders yet</p>
      </div>
    )
  }

  return (
    <motion.div
      variants={listContainer}
      initial="hidden"
      animate="visible"
      className="px-2 space-y-0.5"
    >
      <AnimatePresence>
        {folders.map((folder) => (
          <motion.div key={folder.id} variants={listItem} layout>
            <FolderCard
              folder={folder}
              isActive={folder.id === activeFolderId}
              onSelect={onSelect}
              onReindex={onReindex}
              onDelete={onDelete}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
