'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { MainWorkspace } from './MainWorkspace'
import { AddFolderModal } from '@/components/folders/AddFolderModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { useFolders } from '@/hooks/useFolders'
import { useTabFolders } from '@/hooks/useTabFolders'
import { IntroAnimation } from './IntroAnimation'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

export function AppShell() {
  const { data: session } = useSession()
  const { sidebarCollapsed } = useUIStore()
  const { tabs, activeTabId, closeTab, removeFolderFromTab, loadFromHistory } = useChatStore()
  const [introVisible, setIntroVisible] = useState(true)

  const { folders, isLoading: foldersLoading, refetch: refetchFolders } = useFolders()

  // Restore chat history from DB on first load
  useEffect(() => {
    if (IS_MOCK || !session?.user) return
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions?.length) {
          loadFromHistory(data.sessions)
        }
      })
      .catch(() => {/* silently ignore — history is a nice-to-have */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  // Derive active tab folders for the sources panel
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const activeTabFolderIds = activeTab?.folderIds ?? []

  const { folderFiles, refetch: refetchFiles } = useTabFolders(activeTabFolderIds)

  function handleReindex() {
    refetchFolders()
    refetchFiles()
  }

  function handleDelete(folder: { id: string }) {
    for (const tab of tabs) {
      if (tab.folderIds.includes(folder.id)) {
        if (tab.folderIds.length === 1) {
          closeTab(tab.id)
        } else {
          removeFolderFromTab(tab.id, folder.id)
        }
      }
    }
    refetchFolders()
  }

  const user = IS_MOCK
    ? { name: 'Demo User', email: 'demo@example.com', image: null }
    : session?.user ?? null

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
        <TopBar
          user={user}
          onSignIn={() => signIn('google')}
          onSignOut={() => signOut()}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <AnimatePresence>
            {!sidebarCollapsed && (
              <Sidebar
                folders={folders}
                isLoading={foldersLoading}
                onReindex={handleReindex}
                onDelete={handleDelete}
              />
            )}
          </AnimatePresence>

          {sidebarCollapsed && (
            <button
              onClick={() => useUIStore.getState().toggleSidebar()}
              className="w-6 flex items-center justify-center border-r border-zinc-800 hover:bg-zinc-900 transition-colors group"
              aria-label="Expand sidebar"
            >
              <div className="w-1 h-6 rounded-full bg-zinc-700 group-hover:bg-zinc-500 transition-colors" />
            </button>
          )}

          <MainWorkspace
            allFolders={folders}
            folderFiles={folderFiles}
          />
        </div>

        <AddFolderModal onFolderAdded={handleReindex} />

        {introVisible && (
          <IntroAnimation onComplete={() => setIntroVisible(false)} />
        )}
      </div>
    </TooltipProvider>
  )
}
