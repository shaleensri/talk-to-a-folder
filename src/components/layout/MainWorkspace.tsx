'use client'

import { useCallback, useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { FileTreePanel } from '@/components/layout/FileTreePanel'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { cn } from '@/lib/utils'
import type { IndexedFolder } from '@/types'
import type { FolderWithFiles } from '@/hooks/useTabFolders'

const LEFT_MIN = 180
const LEFT_MAX = 360
const RIGHT_MIN = 300
const RIGHT_MAX = 520

interface MainWorkspaceProps {
  allFolders: IndexedFolder[]
  folderFiles: FolderWithFiles[]
  onReindex: () => void
  onDelete: (folder: IndexedFolder) => void
}

function DragHandle({
  onDragStart,
  isDragging,
}: {
  onDragStart: (e: React.MouseEvent) => void
  isDragging: boolean
}) {
  return (
    <div
      onMouseDown={onDragStart}
      className={cn(
        'w-[5px] flex-shrink-0 flex items-center justify-center cursor-col-resize group relative z-10',
        'border-l border-white/[0.06] hover:border-indigo-500/40 transition-colors',
        isDragging && 'border-indigo-500/60',
      )}
    >
      <div
        className={cn(
          'w-[3px] h-8 rounded-full bg-zinc-700 transition-colors',
          'group-hover:bg-indigo-500/50',
          isDragging && 'bg-indigo-500/70',
        )}
      />
    </div>
  )
}

export function MainWorkspace({ allFolders, folderFiles, onReindex, onDelete }: MainWorkspaceProps) {
  const { leftPanelWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth, openFileId } = useUIStore()
  const { tabs, activeTabId } = useChatStore()
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)

  const handleLeftDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDraggingLeft(true)
      const startX = e.clientX
      const startWidth = leftPanelWidth

      const onMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startX
        setLeftPanelWidth(Math.max(LEFT_MIN, Math.min(LEFT_MAX, startWidth + delta)))
      }
      const onMouseUp = () => {
        setIsDraggingLeft(false)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [leftPanelWidth, setLeftPanelWidth],
  )

  const handleRightDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDraggingRight(true)
      const startX = e.clientX
      const startWidth = rightPanelWidth

      const onMouseMove = (e: MouseEvent) => {
        // Dragging left → right panel grows; dragging right → right panel shrinks
        const delta = e.clientX - startX
        setRightPanelWidth(Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, startWidth - delta)))
      }
      const onMouseUp = () => {
        setIsDraggingRight(false)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [rightPanelWidth, setRightPanelWidth],
  )

  const isDragging = isDraggingLeft || isDraggingRight

  // Resolve which file is open and which folder it belongs to
  const openFile = openFileId
    ? folderFiles.flatMap((ff) => ff.files).find((f) => f.id === openFileId) ?? null
    : null

  return (
    <div className={cn('flex flex-1 min-h-0 overflow-hidden', isDragging && 'select-none')}>
      {/* Left panel — file tree */}
      <div style={{ width: leftPanelWidth }} className="flex-shrink-0 overflow-hidden border-r border-white/[0.06]">
        <FileTreePanel
          allFolders={allFolders}
          folderFiles={folderFiles}
          onReindex={onReindex}
          onDelete={onDelete}
        />
      </div>

      {/* Left drag handle */}
      <DragHandle onDragStart={handleLeftDragStart} isDragging={isDraggingLeft} />

      {/* Center panel — document viewer */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden border-r border-white/[0.06]">
        <DocumentViewer file={openFile} />
      </div>

      {/* Right drag handle */}
      <DragHandle onDragStart={handleRightDragStart} isDragging={isDraggingRight} />

      {/* Right panel — chat */}
      <div style={{ width: rightPanelWidth }} className="flex-shrink-0 overflow-hidden">
        <ChatPanel activeTab={activeTab} allFolders={allFolders} />
      </div>
    </div>
  )
}
