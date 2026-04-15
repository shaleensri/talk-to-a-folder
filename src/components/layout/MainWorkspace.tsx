'use client'

import { PanelRightOpen, PanelRightClose } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store/ui-store'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { SourcesPanel } from '@/components/sources/SourcesPanel'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SOURCES_PANEL_WIDTH } from '@/constants'
import type { IndexedFolder, DriveFile } from '@/types'

interface MainWorkspaceProps {
  activeFolder: IndexedFolder | null
  files: DriveFile[]
}

export function MainWorkspace({ activeFolder, files }: MainWorkspaceProps) {
  const { rightPanelOpen, setRightPanelOpen } = useUIStore()

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Chat panel */}
      <div className="flex flex-1 flex-col min-w-0 relative">
        <ChatPanel activeFolder={activeFolder} />

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

      {/* Vertical divider + sources panel */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: SOURCES_PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex flex-shrink-0 overflow-hidden"
          >
            <Separator orientation="vertical" />
            <div style={{ width: SOURCES_PANEL_WIDTH }} className="flex-shrink-0">
              <SourcesPanel activeFolder={activeFolder} files={files} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
