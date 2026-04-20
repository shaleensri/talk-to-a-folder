'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Plus, FolderOpen, MessageSquare, ChevronDown, PenSquare } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useChatStore } from '@/store/chat-store'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'
import { FolderPickerModal } from '@/components/folders/FolderPickerModal'
import { cn } from '@/lib/utils'
import type { ChatTab, IndexedFolder } from '@/types'

interface ChatPanelProps {
  activeTab: ChatTab | null
  allFolders: IndexedFolder[]
}

// ── Chat name derived from folder names ─────────────────────────────────────

function chatLabel(folderIds: string[], allFolders: IndexedFolder[]): string {
  const names = folderIds.map((id) => allFolders.find((f) => f.id === id)?.name ?? 'Unknown')
  if (names.length === 0) return 'New Chat'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `${names[0]} +${names.length - 1} more`
}

// ── Chat dropdown ────────────────────────────────────────────────────────────

interface ChatDropdownProps {
  allFolders: IndexedFolder[]
  onNewChat: () => void
}

function ChatDropdown({ allFolders, onNewChat }: ChatDropdownProps) {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useChatStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const label = activeTab ? chatLabel(activeTab.folderIds, allFolders) : 'No chat'

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 max-w-[180px] rounded-md px-2 py-1 transition-colors',
          'text-zinc-200 hover:bg-zinc-800 group',
          open && 'bg-zinc-800',
        )}
      >
        <MessageSquare className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
        <span className="text-sm font-medium truncate">{label}</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 z-50 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl overflow-hidden">
          {tabs.length === 0 ? (
            <div className="px-3 py-4 text-xs text-zinc-600 text-center">No chats yet</div>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId
                return (
                  <div
                    key={tab.id}
                    className={cn(
                      'group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                      isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200',
                    )}
                    onClick={() => { setActiveTabId(tab.id); setOpen(false) }}
                  >
                    <MessageSquare className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? 'text-indigo-400' : 'text-zinc-600')} />
                    <span className="flex-1 text-xs truncate">{chatLabel(tab.folderIds, allFolders)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                      className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-zinc-600 hover:text-zinc-300 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="border-t border-zinc-800">
            <button
              onClick={() => { onNewChat(); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-indigo-400 hover:bg-zinc-800/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New chat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Folder context pills ─────────────────────────────────────────────────────

interface FolderPillsProps {
  activeTab: ChatTab
  activeFolders: IndexedFolder[]
  addableFolders: IndexedFolder[]
}

function FolderPills({ activeTab, activeFolders, addableFolders }: FolderPillsProps) {
  const { removeFolderFromTab, addFolderToTab } = useChatStore()
  const [addFolderOpen, setAddFolderOpen] = useState(false)

  function handleAddFolders(folderIds: string[]) {
    for (const id of folderIds) addFolderToTab(activeTab.id, id)
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap px-3 py-1.5">
        {activeFolders.map((folder) => (
          <span
            key={folder.id}
            className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
          >
            <FolderOpen className="w-2.5 h-2.5 text-zinc-600" />
            <span className="max-w-[100px] truncate">{folder.name}</span>
            {activeFolders.length > 1 && (
              <button
                onClick={() => removeFolderFromTab(activeTab.id, folder.id)}
                className="ml-0.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                aria-label={`Remove ${folder.name}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        ))}

        {addableFolders.length > 0 && (
          <button
            onClick={() => setAddFolderOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-dashed border-zinc-700 text-zinc-600 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
            Add
          </button>
        )}
      </div>

      <FolderPickerModal
        open={addFolderOpen}
        onClose={() => setAddFolderOpen(false)}
        onConfirm={handleAddFolders}
        folders={addableFolders}
        title="Add folders to this chat"
      />
    </>
  )
}

// ── Main ChatPanel ───────────────────────────────────────────────────────────

export function ChatPanel({ activeTab, allFolders }: ChatPanelProps) {
  const { messages, isStreaming, sendMessage, stopStreaming } = useChat(activeTab?.id ?? null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const { addTab, setTabQuotedText } = useChatStore()

  const activeFolders = (activeTab?.folderIds ?? [])
    .map((id) => allFolders.find((f) => f.id === id))
    .filter((f): f is IndexedFolder => !!f)

  const addableFolders = allFolders.filter(
    (f) => f.status === 'indexed' && !activeTab?.folderIds.includes(f.id),
  )

  const canChat =
    activeFolders.length > 0 &&
    activeFolders.every((f) => f.status === 'indexed')

  function handleSend(text: string, sourceFileId?: string) {
    if (!activeTab || !canChat) return
    sendMessage(text, sourceFileId)
  }

  function handleNewChat(folderIds: string[]) {
    addTab(folderIds)
    setNewChatOpen(false)
  }

  const placeholder = !activeTab
    ? 'Create a chat to start asking questions…'
    : activeFolders.some((f) => f.status === 'ingesting')
    ? 'Indexing in progress…'
    : !canChat
    ? 'All referenced folders must be indexed first…'
    : 'Ask a question about your folder…'

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950">
      {/* ── Panel header: chat dropdown + new chat button ── */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/[0.06] flex-shrink-0">
        <ChatDropdown
          allFolders={allFolders}
          onNewChat={() => setNewChatOpen(true)}
        />
        <button
          onClick={() => setNewChatOpen(true)}
          className="rounded p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="New chat"
        >
          <PenSquare className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Folder context pills ── */}
      {activeTab && (
        <div className="border-b border-white/[0.04] flex-shrink-0">
          <FolderPills
            activeTab={activeTab}
            activeFolders={activeFolders}
            addableFolders={addableFolders}
          />
        </div>
      )}

      {/* ── Messages ── */}
      <MessageList
        messages={messages}
        activeFolder={activeFolders[0] ?? null}
        onQuestionSelect={handleSend}
      />

      {/* Fade gradient */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent z-10" />

      {/* ── Composer ── */}
      <div className="relative z-20 flex-shrink-0">
        <ChatComposer
          onSend={(text, fileId) => handleSend(text, fileId)}
          onStop={stopStreaming}
          isLoading={isStreaming}
          disabled={!canChat}
          placeholder={placeholder}
          quotedText={activeTab?.quotedText}
          onClearQuote={activeTab ? () => setTabQuotedText(activeTab.id, null) : undefined}
        />
      </div>

      {/* New chat picker modal */}
      <FolderPickerModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onConfirm={handleNewChat}
        folders={allFolders.filter((f) => f.status === 'indexed')}
        title="Choose folders for this chat"
      />
    </div>
  )
}
