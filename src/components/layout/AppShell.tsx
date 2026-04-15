'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { MainWorkspace } from './MainWorkspace'
import { AddFolderModal } from '@/components/folders/AddFolderModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { useFolders } from '@/hooks/useFolders'
import { useFolder } from '@/hooks/useFolder'
import { MOCK_FOLDERS } from '@/lib/mock-data'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

export function AppShell() {
  const { data: session } = useSession()
  const { activeFolderId, setActiveFolderId } = useChatStore()
  const { sidebarCollapsed } = useUIStore()

  // In mock mode, use mock data; in real mode, fetch from API
  const { folders, isLoading: foldersLoading } = useFolders()

  // Auto-select first folder on load
  useEffect(() => {
    if (!activeFolderId && folders.length > 0) {
      setActiveFolderId(folders[0].id)
    }
  }, [folders, activeFolderId, setActiveFolderId])

  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? null
  const { files } = useFolder(activeFolderId)

  const user = IS_MOCK
    ? { name: 'Demo User', email: 'demo@example.com', image: null }
    : session?.user ?? null

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
        <TopBar
          activeFolder={activeFolder}
          folders={folders}
          user={user}
          onSignIn={() => signIn('google')}
          onSignOut={() => signOut()}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar — hidden on collapse */}
          <AnimatePresence>
            {!sidebarCollapsed && (
              <Sidebar folders={folders} isLoading={foldersLoading} />
            )}
          </AnimatePresence>

          {/* Sidebar collapsed — show expand handle */}
          {sidebarCollapsed && (
            <button
              onClick={() => useUIStore.getState().toggleSidebar()}
              className="w-6 flex items-center justify-center border-r border-zinc-800 hover:bg-zinc-900 transition-colors group"
              aria-label="Expand sidebar"
            >
              <div className="w-1 h-6 rounded-full bg-zinc-700 group-hover:bg-zinc-500 transition-colors" />
            </button>
          )}

          <MainWorkspace activeFolder={activeFolder} files={files} />
        </div>

        <AddFolderModal />
      </div>
    </TooltipProvider>
  )
}
