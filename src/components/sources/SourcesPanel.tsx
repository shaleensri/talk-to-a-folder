'use client'

import { SourceTabs } from './SourceTabs'
import type { FolderWithFiles } from '@/hooks/useTabFolders'

interface SourcesPanelProps {
  folderFiles: FolderWithFiles[]
}

export function SourcesPanel({ folderFiles }: SourcesPanelProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <SourceTabs folderFiles={folderFiles} />
    </div>
  )
}
