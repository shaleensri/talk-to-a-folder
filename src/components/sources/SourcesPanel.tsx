'use client'

import { SourceTabs } from './SourceTabs'
import type { IndexedFolder, DriveFile } from '@/types'

interface SourcesPanelProps {
  activeFolder: IndexedFolder | null
  files: DriveFile[]
}

export function SourcesPanel({ activeFolder, files }: SourcesPanelProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <SourceTabs activeFolder={activeFolder} files={files} />
    </div>
  )
}
