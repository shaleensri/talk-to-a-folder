'use client'

import { FolderPlus, Search, ChevronLeft, MessageSquare, Plus, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { FolderList } from '@/components/folders/FolderList'
import { FolderPickerModal } from '@/components/folders/FolderPickerModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SIDEBAR_WIDTH } from '@/constants'
import type { IndexedFolder } from '@/types'

interface SidebarProps {
  folders: IndexedFolder[]
  isLoading?: boolean
  onReindex?: () => void
  onDelete?: (folder: IndexedFolder) => void
}

function chatLabel(folderIds: string[], allFolders: IndexedFolder[]): string {
  const names = folderIds.map((id) => allFolders.find((f) => f.id === id)?.name ?? 'Unknown')
  if (names.length === 0) return 'New Chat'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `${names[0]} +${names.length - 1} more`
}

export function Sidebar({ folders, isLoading, onReindex, onDelete }: SidebarProps) {
  const { setAddFolderModalOpen } = useUIStore()
  const sidebarCollapsed = false
  const toggleSidebar = () => {}
  const { tabs, activeTabId, addTab, closeTab, setActiveTabId } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)

  const filtered = searchQuery
    ? folders.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : folders

  function handleFolderSelect(folder: IndexedFolder) {
    const existing = tabs.find(
      (t) => t.folderIds.length === 1 && t.folderIds[0] === folder.id,
    )
    if (existing) {
      setActiveTabId(existing.id)
    } else {
      addTab([folder.id])
    }
  }

  function handleNewChat(folderIds: string[]) {
    addTab(folderIds)
    setNewChatOpen(false)
  }

  // Highlight the first folder of the active tab in the folder list
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const highlightedFolderId = activeTab?.folderIds[0] ?? null

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex-shrink-0 overflow-hidden border-r border-white/[0.06] bg-zinc-950"
    >
      <div className="flex h-full flex-col" style={{ width: SIDEBAR_WIDTH }}>

        {/* ── Sidebar header ── */}
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Workspace
          </span>
          <button
            onClick={toggleSidebar}
            className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Chats section */}
          <div className="px-3 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                Chats
                {tabs.length > 0 && (
                  <span className="ml-1.5 text-zinc-700">({tabs.length})</span>
                )}
              </span>
              <button
                onClick={() => setNewChatOpen(true)}
                className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors rounded px-1.5 py-0.5 hover:bg-zinc-800"
                title="New chat"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>

            {tabs.length === 0 ? (
              <p className="text-xs text-zinc-700 py-2 pl-1">
                Click a folder or{' '}
                <button
                  className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
                  onClick={() => setNewChatOpen(true)}
                >
                  start a new chat
                </button>
              </p>
            ) : (
              <div className="space-y-0.5">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId
                  const label = chatLabel(tab.folderIds, folders)
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        'group flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                        isActive
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                      )}
                      onClick={() => setActiveTabId(tab.id)}
                    >
                      <MessageSquare className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? 'text-indigo-400' : 'text-zinc-600')} />
                      <span className="flex-1 truncate text-xs">{label}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(tab.id)
                        }}
                        className={cn(
                          'flex-shrink-0 rounded p-0.5 transition-colors',
                          isActive
                            ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                            : 'text-transparent group-hover:text-zinc-600 hover:!text-zinc-300',
                        )}
                        aria-label={`Close ${label}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="mx-3 my-3 border-t border-zinc-800" />

          {/* Folders section */}
          <div className="px-3 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
              Folders
              {folders.length > 0 && (
                <span className="ml-1.5 text-zinc-700">({folders.length})</span>
              )}
            </span>
          </div>

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

          <FolderList
            folders={filtered}
            activeFolderId={highlightedFolderId}
            onSelect={handleFolderSelect}
            onReindex={onReindex}
            onDelete={onDelete}
            isLoading={isLoading}
          />
        </div>

        {/* ── Footer ── */}
        <div className="p-3 border-t border-zinc-800 flex-shrink-0">
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

      <FolderPickerModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onConfirm={handleNewChat}
        folders={folders}
        title="Choose folders for this chat"
      />
    </motion.aside>
  )
}
