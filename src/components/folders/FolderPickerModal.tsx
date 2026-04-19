'use client'

import { useState } from 'react'
import { Check, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FolderStatusPill } from '@/components/folders/FolderStatusPill'
import type { IndexedFolder } from '@/types'

interface FolderPickerModalProps {
  open: boolean
  onClose: () => void
  /** Called with the selected folder ids when user confirms */
  onConfirm: (folderIds: string[]) => void
  /** Folders to display — pass only folders the user hasn't already added */
  folders: IndexedFolder[]
  title?: string
  /** Minimum folders to require before confirming (default 1) */
  minSelect?: number
}

export function FolderPickerModal({
  open,
  onClose,
  onConfirm,
  folders,
  title = 'Choose folders for this chat',
  minSelect = 1,
}: FolderPickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConfirm() {
    if (selected.size < minSelect) return
    onConfirm(Array.from(selected))
    setSelected(new Set())
    onClose()
  }

  function handleClose() {
    setSelected(new Set())
    onClose()
  }

  const indexedFolders = folders.filter((f) => f.status === 'indexed')
  const otherFolders = folders.filter((f) => f.status !== 'indexed')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-1 max-h-72 overflow-y-auto pr-1">
          {folders.length === 0 && (
            <p className="text-sm text-zinc-500 py-4 text-center">
              No folders available. Add a folder first.
            </p>
          )}

          {indexedFolders.map((folder) => {
            const isSelected = selected.has(folder.id)
            return (
              <button
                key={folder.id}
                onClick={() => toggle(folder.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                  isSelected
                    ? 'bg-indigo-500/10 border border-indigo-500/30'
                    : 'hover:bg-zinc-800 border border-transparent',
                )}
              >
                {/* Checkbox indicator */}
                <span
                  className={cn(
                    'flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors',
                    isSelected
                      ? 'bg-indigo-500 border-indigo-500'
                      : 'border-zinc-600',
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>

                <FolderOpen className="flex-shrink-0 w-4 h-4 text-zinc-400" />

                <span className="flex-1 text-sm text-zinc-200 truncate">{folder.name}</span>

                <FolderStatusPill status={folder.status} size="sm" />
              </button>
            )
          })}

          {/* Non-indexed folders — shown dimmed, not selectable */}
          {otherFolders.map((folder) => (
            <div
              key={folder.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed"
            >
              <span className="flex-shrink-0 w-4 h-4 rounded border border-zinc-600" />
              <FolderOpen className="flex-shrink-0 w-4 h-4 text-zinc-500" />
              <span className="flex-1 text-sm text-zinc-400 truncate">{folder.name}</span>
              <FolderStatusPill status={folder.status} size="sm" />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selected.size < minSelect}
            onClick={handleConfirm}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {selected.size === 0
              ? 'Select a folder'
              : `Start chat with ${selected.size} folder${selected.size > 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
