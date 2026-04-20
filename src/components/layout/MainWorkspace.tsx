'use client'

import { useRef, useState } from 'react'
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
// Center panel must always have at least this many px so the right panel can't push off-screen
const CENTER_MIN = 200

interface MainWorkspaceProps {
  allFolders: IndexedFolder[]
  folderFiles: FolderWithFiles[]
  onReindex: () => void
  onDelete: (folder: IndexedFolder) => void
}

// ---------------------------------------------------------------------------
// DragHandle — uses pointer capture so pointerup always fires on this element,
// even when the cursor leaves the browser window mid-drag. This is the only
// approach that reliably ends the drag when the mouse button is released.
// ---------------------------------------------------------------------------
interface DragHandleProps {
  /** Panel width at the start of the current drag — captured once in onPointerDown */
  captureWidth: () => number
  /** Called on every pointermove with the new computed width */
  onWidthChange: (w: number) => void
  /** +1 = left handle (drag right → wider), -1 = right handle (drag left → wider) */
  sign: 1 | -1
  min: number
  max: number
  isDragging: boolean
  setIsDragging: (v: boolean) => void
}

function DragHandle({
  captureWidth,
  onWidthChange,
  sign,
  min,
  max,
  isDragging,
  setIsDragging,
}: DragHandleProps) {
  const startRef = useRef<{ x: number; width: number } | null>(null)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, width: captureWidth() }
    setIsDragging(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return
    const delta = (e.clientX - startRef.current.x) * sign
    onWidthChange(Math.max(min, Math.min(max, startRef.current.width + delta)))
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    startRef.current = null
    setIsDragging(false)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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

  // Stable refs so DragHandle callbacks always read current store values
  // without needing to be recreated on every render.
  const leftWidthRef = useRef(leftPanelWidth)
  leftWidthRef.current = leftPanelWidth

  const rightWidthRef = useRef(rightPanelWidth)
  rightWidthRef.current = rightPanelWidth

  const isDragging = isDraggingLeft || isDraggingRight

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
      <DragHandle
        captureWidth={() => leftWidthRef.current}
        onWidthChange={setLeftPanelWidth}
        sign={1}
        min={LEFT_MIN}
        max={LEFT_MAX}
        isDragging={isDraggingLeft}
        setIsDragging={setIsDraggingLeft}
      />

      {/* Center panel — document viewer */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden border-r border-white/[0.06]">
        <DocumentViewer file={openFile} allFolders={allFolders} />
      </div>

      {/* Right drag handle */}
      <DragHandle
        captureWidth={() => rightWidthRef.current}
        onWidthChange={(w) => {
          // Cap so the center panel always has CENTER_MIN px of space
          const available = window.innerWidth - leftWidthRef.current - 10
          setRightPanelWidth(Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, Math.min(available - CENTER_MIN, w))))
        }}
        sign={-1}
        min={RIGHT_MIN}
        max={RIGHT_MAX}
        isDragging={isDraggingRight}
        setIsDragging={setIsDraggingRight}
      />

      {/* Right panel — chat */}
      <div style={{ width: rightPanelWidth }} className="flex-shrink-0 overflow-hidden">
        <ChatPanel activeTab={activeTab} allFolders={allFolders} />
      </div>
    </div>
  )
}
