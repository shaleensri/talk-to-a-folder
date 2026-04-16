'use client'

import { FolderPlus, Search, ChevronLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { FolderList } from '@/components/folders/FolderList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SIDEBAR_WIDTH, TOPBAR_HEIGHT } from '@/constants'
import type { IndexedFolder } from '@/types'

interface SidebarProps {
  folders: IndexedFolder[]
  isLoading?: boolean
  onReindex?: () => void
  onDelete?: () => void
}

export function Sidebar({ folders, isLoading, onReindex, onDelete }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar, setAddFolderModalOpen } = useUIStore()
  const { activeFolderId, setActiveFolderId, clearMessages } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = searchQuery
    ? folders.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : folders

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex-shrink-0 overflow-hidden border-r border-white/[0.06] bg-zinc-950"
      style={{ top: 0 }}
    >
      <div
        className="flex h-full flex-col"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Folders
            {folders.length > 0 && (
              <span className="ml-1.5 text-zinc-600">({folders.length})</span>
            )}
          </span>
          <button
            onClick={toggleSidebar}
            className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search */}
        {folders.length > 3 && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
              <Input
                placeholder="Search folders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-8 text-xs bg-zinc-900/50"
              />
            </div>
          </div>
        )}

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto py-1">
          <FolderList
            folders={filtered}
            activeFolderId={activeFolderId}
            onSelect={(folder) => {
              setActiveFolderId(folder.id)
              clearMessages()
            }}
            onReindex={onReindex}
            onDelete={onDelete}
            isLoading={isLoading}
          />
        </div>

        {/* Add folder CTA */}
        <div className="p-3 border-t border-zinc-800">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-zinc-500 hover:text-zinc-300"
            onClick={() => setAddFolderModalOpen(true)}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Add folder
          </Button>
        </div>
      </div>
    </motion.aside>
  )
}
