'use client'

import { FolderOpen, Plus, LogIn } from 'lucide-react'
import Image from 'next/image'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TOPBAR_HEIGHT } from '@/constants'

interface TopBarProps {
  user: { name?: string | null; image?: string | null; email?: string | null } | null
  onSignIn: () => void
  onSignOut: () => void
}

export function TopBar({ user, onSignIn, onSignOut }: TopBarProps) {
  const { setAddFolderModalOpen } = useUIStore()

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.05] shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.4)]"
      style={{ height: TOPBAR_HEIGHT }}
    >
      {/* Left — Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_14px_rgba(99,102,241,0.45)]">
            <FolderOpen className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-zinc-100">talk</span><span className="text-indigo-400">·</span><span className="text-zinc-100">folder</span>
          </span>
        </div>
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
