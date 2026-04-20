'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { TopBar } from './TopBar'
import { MainWorkspace } from './MainWorkspace'
import { AddFolderModal } from '@/components/folders/AddFolderModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useChatStore } from '@/store/chat-store'
import { useFolders } from '@/hooks/useFolders'
import { useTabFolders } from '@/hooks/useTabFolders'
import { IntroAnimation } from './IntroAnimation'
import type { IndexedFolder } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

export function AppShell() {
  const { data: session } = useSession()
  const { tabs, closeTab, removeFolderFromTab, loadFromHistory } = useChatStore()
  const [introVisible, setIntroVisible] = useState(true)

  const { folders, refetch: refetchFolders } = useFolders()

  // Restore chat history from DB on first load
  useEffect(() => {
    if (IS_MOCK || !session?.user) return
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions?.length) loadFromHistory(data.sessions)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  // Derive active tab folders for file fetching
  // Fetch files for all folders so FileTreePanel has the full tree.
  const allFolderIds = folders.map((f) => f.id)
  const { folderFiles: allFolderFiles, refetch: refetchFiles } = useTabFolders(allFolderIds)

  function handleReindex() {
    refetchFolders()
    refetchFiles()
  }

  function handleDelete(folder: IndexedFolder) {
    for (const tab of tabs) {
      if (tab.folderIds.includes(folder.id)) {
        if (tab.folderIds.length === 1) closeTab(tab.id)
        else removeFolderFromTab(tab.id, folder.id)
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
          <MainWorkspace
            allFolders={folders}
            folderFiles={allFolderFiles}
            onReindex={handleReindex}
            onDelete={handleDelete}
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
