'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Refs hold drag state so event handlers added once via useEffect
  // always read current values — no stale closures, no listener stacking.
  const leftDragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const rightDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (leftDragRef.current) {
        const { startX, startWidth } = leftDragRef.current
        setLeftPanelWidth(Math.max(LEFT_MIN, Math.min(LEFT_MAX, startWidth + (e.clientX - startX))))
      }
      if (rightDragRef.current) {
        const { startX, startWidth } = rightDragRef.current
        setRightPanelWidth(Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, startWidth - (e.clientX - startX))))
      }
    }
    const onMouseUp = () => {
      if (leftDragRef.current) { leftDragRef.current = null; setIsDraggingLeft(false) }
      if (rightDragRef.current) { rightDragRef.current = null; setIsDraggingRight(false) }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setLeftPanelWidth, setRightPanelWidth])

  const handleLeftDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    leftDragRef.current = { startX: e.clientX, startWidth: leftPanelWidth }
    setIsDraggingLeft(true)
  }, [leftPanelWidth])

  const handleRightDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    rightDragRef.current = { startX: e.clientX, startWidth: rightPanelWidth }
    setIsDraggingRight(true)
  }, [rightPanelWidth])

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
