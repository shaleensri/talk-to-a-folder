'use client'

import { useCallback, useRef, useState } from 'react'
import { PanelRightOpen, PanelRightClose } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { SourcesPanel } from '@/components/sources/SourcesPanel'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SOURCES_PANEL_WIDTH } from '@/constants'
import { cn } from '@/lib/utils'
import type { IndexedFolder, DriveFile } from '@/types'

const MIN_SOURCES_WIDTH = 240
const MAX_SOURCES_WIDTH = 640

interface MainWorkspaceProps {
  allFolders: IndexedFolder[]
  primaryFolder: IndexedFolder | null
  files: DriveFile[]
}

export function MainWorkspace({ allFolders, primaryFolder, files }: MainWorkspaceProps) {
  const { rightPanelOpen, setRightPanelOpen } = useUIStore()
  const { tabs, activeTabId } = useChatStore()
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const [sourcesWidth, setSourcesWidth] = useState(SOURCES_PANEL_WIDTH)
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)

      const startX = e.clientX
      const startWidth = sourcesWidth

      const onMouseMove = (e: MouseEvent) => {
        // Dragging left (smaller clientX) → panel grows; right → panel shrinks
        const delta = e.clientX - startX
        setSourcesWidth(
          Math.max(MIN_SOURCES_WIDTH, Math.min(MAX_SOURCES_WIDTH, startWidth - delta)),
        )
      }

      const onMouseUp = () => {
        setIsDragging(false)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [sourcesWidth],
  )

  return (
    // Disable text selection globally while dragging
    <div className={cn('flex flex-1 min-h-0 overflow-hidden', isDragging && 'select-none')}>
      {/* Chat panel */}
      <div className="flex flex-1 flex-col min-w-0 relative">
        <ChatPanel activeTab={activeTab} allFolders={allFolders} />

        {/* Toggle sources panel button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 z-10 text-zinc-500 hover:text-zinc-300"
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
            >
              {rightPanelOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {rightPanelOpen ? 'Hide sources panel' : 'Show sources panel'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Drag handle + sources panel */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sourcesWidth + 5 /* +5 for handle */, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex flex-shrink-0 overflow-hidden"
          >
            {/* Drag handle — replaces the static Separator */}
            <div
              onMouseDown={handleDragStart}
              className={cn(
                'w-[5px] flex-shrink-0 flex items-center justify-center cursor-col-resize group relative',
                'border-l border-white/[0.06] hover:border-indigo-500/40 transition-colors',
                isDragging && 'border-indigo-500/60',
              )}
              title="Drag to resize"
            >
              {/* Visual pill shown on hover / drag */}
              <div
                className={cn(
                  'w-[3px] h-8 rounded-full bg-zinc-700 transition-colors',
                  'group-hover:bg-indigo-500/50',
                  isDragging && 'bg-indigo-500/70',
                )}
              />
            </div>

            {/* Sources panel — fixed to current sourcesWidth */}
            <div style={{ width: sourcesWidth }} className="flex-shrink-0 overflow-hidden">
              <SourcesPanel activeFolder={primaryFolder} files={files} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
