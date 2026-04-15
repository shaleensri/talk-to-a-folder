'use client'

import { FolderOpen, Plus, LogIn, LogOut, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { Button } from '@/components/ui/button'
import { FolderStatusPill } from '@/components/folders/FolderStatusPill'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TOPBAR_HEIGHT } from '@/constants'
import type { IndexedFolder } from '@/types'

interface TopBarProps {
  activeFolder: IndexedFolder | null
  folders: IndexedFolder[]
  user: { name?: string | null; image?: string | null; email?: string | null } | null
  onSignIn: () => void
  onSignOut: () => void
}

export function TopBar({ activeFolder, folders, user, onSignIn, onSignOut }: TopBarProps) {
  const { setAddFolderModalOpen } = useUIStore()

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md"
      style={{ height: TOPBAR_HEIGHT }}
    >
      {/* Left — Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-glow-sm">
            <FolderOpen className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">
            talk<span className="text-indigo-400">·</span>folder
          </span>
        </div>

        {/* Divider */}
        {activeFolder && (
          <>
            <span className="text-zinc-700 select-none">/</span>
            <motion.div
              key={activeFolder.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <span className="text-sm text-zinc-300 font-medium truncate max-w-[200px]">
                {activeFolder.name}
              </span>
              <FolderStatusPill status={activeFolder.status} size="sm" />
            </motion.div>
          </>
        )}
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddFolderModalOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add folder</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Index a Google Drive folder</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-2 rounded-full px-1 py-1 hover:bg-zinc-800 transition-colors group"
                >
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={user.name ?? 'Account'}
                      width={28}
                      height={28}
                      className="rounded-full ring-2 ring-zinc-700 group-hover:ring-zinc-600 transition-all"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-semibold text-white">
                      {user.name?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-center">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-zinc-400 text-xs">{user.email}</div>
                  <div className="text-zinc-500 text-xs mt-1">Click to sign out</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Button size="sm" onClick={onSignIn} className="gap-1.5">
            <LogIn className="w-3.5 h-3.5" />
            Connect Google
          </Button>
        )}
      </div>
    </header>
  )
}
