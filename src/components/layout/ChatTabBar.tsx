'use client'

import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatTab, IndexedFolder } from '@/types'

interface ChatTabBarProps {
  tabs: ChatTab[]
  activeTabId: string | null
  allFolders: IndexedFolder[]
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  onNew: () => void  // opens FolderPickerModal
}

function tabLabel(tab: ChatTab, allFolders: IndexedFolder[]): string {
  const names = tab.folderIds
    .map((id) => allFolders.find((f) => f.id === id)?.name ?? 'Unknown')
  if (names.length === 0) return 'New Chat'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `${names[0]} +${names.length - 1} more`
}

export function ChatTabBar({
  tabs,
  activeTabId,
  allFolders,
  onSelect,
  onClose,
  onNew,
}: ChatTabBarProps) {
  return (
    <div className="flex items-center border-b border-white/[0.06] bg-zinc-950 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const label = tabLabel(tab, allFolders)

        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'group relative flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-r border-white/[0.06] transition-colors min-w-0 max-w-[200px]',
              isActive
                ? 'bg-zinc-900 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50',
            )}
          >
            {/* Active indicator line */}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-indigo-500" />
            )}

            <span className="truncate flex-1 text-left">{label}</span>

            {/* Close button — only shown when tab count > 1 to prevent accidental all-close */}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onClose(tab.id)
                }
              }}
              className={cn(
                'flex-shrink-0 rounded p-0.5 transition-colors',
                isActive
                  ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                  : 'text-transparent group-hover:text-zinc-500 hover:!text-zinc-300 hover:bg-zinc-800',
              )}
              aria-label={`Close ${label}`}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        )
      })}

      {/* New chat button */}
      <button
        onClick={onNew}
        className="flex-shrink-0 flex items-center justify-center w-9 h-full text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors"
        aria-label="New chat"
        title="New chat"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}
