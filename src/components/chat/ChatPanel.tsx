'use client'

import { useState } from 'react'
import { X, Plus, FolderOpen } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useChatStore } from '@/store/chat-store'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'
import { FolderPickerModal } from '@/components/folders/FolderPickerModal'
import type { ChatTab, IndexedFolder } from '@/types'

interface ChatPanelProps {
  activeTab: ChatTab | null
  allFolders: IndexedFolder[]
}

export function ChatPanel({ activeTab, allFolders }: ChatPanelProps) {
  const { messages, isStreaming, sendMessage, stopStreaming } = useChat(activeTab?.id ?? null)
  const { addFolderToTab, removeFolderFromTab } = useChatStore()
  const [addFolderOpen, setAddFolderOpen] = useState(false)

  // Resolve folder objects for the active tab
  const activeFolders = (activeTab?.folderIds ?? [])
    .map((id) => allFolders.find((f) => f.id === id))
    .filter((f): f is IndexedFolder => !!f)

  // Folders the user could add (indexed, not already in tab)
  const addableFolders = allFolders.filter(
    (f) => !activeTab?.folderIds.includes(f.id),
  )

  // Chat is usable only when ALL referenced folders are indexed
  const canChat =
    activeFolders.length > 0 &&
    activeFolders.every((f) => f.status === 'indexed')

  function handleSend(text: string) {
    if (!activeTab || !canChat) return
    sendMessage(text)
  }

  function handleAddFolders(folderIds: string[]) {
    if (!activeTab) return
    for (const id of folderIds) addFolderToTab(activeTab.id, id)
  }

  const placeholder = !activeTab
    ? 'Open or create a chat tab to start asking questions…'
    : activeFolders.some((f) => f.status === 'ingesting')
    ? 'Indexing in progress…'
    : !canChat
    ? 'All referenced folders must be indexed first…'
    : 'Ask a question about your folder…'

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Folder badges — which folders this chat is referencing */}
      {activeTab && (
        <div className="flex items-center gap-1.5 flex-wrap px-4 py-2 border-b border-white/[0.04] bg-zinc-950/60">
          {activeFolders.map((folder) => (
            <span
              key={folder.id}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700"
            >
              <FolderOpen className="w-3 h-3 text-zinc-500" />
              <span className="max-w-[120px] truncate">{folder.name}</span>
              {activeFolders.length > 1 && (
                <button
                  onClick={() => removeFolderFromTab(activeTab.id, folder.id)}
                  className="ml-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
                  aria-label={`Remove ${folder.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}

          {addableFolders.length > 0 && (
            <button
              onClick={() => setAddFolderOpen(true)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add folder
            </button>
          )}
        </div>
      )}

      <MessageList
        messages={messages}
        activeFolder={activeFolders[0] ?? null}
        onQuestionSelect={handleSend}
      />

      {/* Fade gradient so messages dissolve into the floating composer */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent z-10" />

      <div className="relative z-20">
        <ChatComposer
          onSend={handleSend}
          onStop={stopStreaming}
          isLoading={isStreaming}
          disabled={!canChat}
          placeholder={placeholder}
        />
      </div>

      <FolderPickerModal
        open={addFolderOpen}
        onClose={() => setAddFolderOpen(false)}
        onConfirm={handleAddFolders}
        folders={addableFolders}
        title="Add folders to this chat"
      />
    </div>
  )
}
