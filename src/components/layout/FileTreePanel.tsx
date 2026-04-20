'use client'

import { useState } from 'react'
import {
  FolderOpen,
  FolderClosed,
  FileText,
  Sheet,
  File,
  RefreshCw,
  Trash2,
  Plus,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'
import { cn, formatRelativeTime, formatFileSize } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FolderStatusPill } from '@/components/folders/FolderStatusPill'
import type { IndexedFolder, DriveFile } from '@/types'
import type { FolderWithFiles } from '@/hooks/useTabFolders'

const STALE_HOURS = 24

function hoursAgo(date: Date): number {
  return (Date.now() - new Date(date).getTime()) / 3_600_000
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes('document') || mimeType.includes('word'))
    return <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return <Sheet className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
  if (mimeType === 'application/pdf')
    return <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
  return <File className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
}

const statusDot: Record<DriveFile['status'], string> = {
  indexed: 'bg-emerald-500',
  parsing: 'bg-indigo-500 animate-pulse',
  pending: 'bg-zinc-700',
  error: 'bg-red-500',
  skipped: 'bg-zinc-600',
}

const DEFAULT_ERROR_MSG: Record<string, string> = {
  error: 'Failed to parse this file.',
  skipped: 'File was skipped — no usable text content found.',
}

interface FolderRowProps {
  folder: IndexedFolder
  files: DriveFile[]
  onReindex: () => void
  onDelete: (folder: IndexedFolder) => void
}

function FolderRow({ folder, files, onReindex, onDelete }: FolderRowProps) {
  const [expanded, setExpanded] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { openFileId, setOpenFileId } = useUIStore()

  const isStale =
    folder.status === 'indexed' &&
    folder.lastIndexed != null &&
    hoursAgo(folder.lastIndexed) > STALE_HOURS

  async function handleReindex(e: React.MouseEvent) {
    e.stopPropagation()
    setReindexing(true)
    try {
      await fetch(`/api/folders/${folder.id}/ingest`, { method: 'POST' })
      const poll = async (): Promise<void> => {
        const res = await fetch(`/api/folders/${folder.id}/status`)
        const data = await res.json()
        const status = data.status?.status ?? data.status
        if (status === 'indexed' || status === 'error') {
          onReindex()
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
        return poll()
      }
      await poll()
    } finally {
      setReindexing(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' })
      onDelete(folder)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div>
      {/* Folder header row */}
      <div
        className="group flex items-center gap-1.5 px-2 py-2 cursor-pointer hover:bg-zinc-900/60 transition-colors rounded-md"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          className={cn(
            'w-3 h-3 text-zinc-600 flex-shrink-0 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />

        {expanded
          ? <FolderOpen className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          : <FolderClosed className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        }

        <span className="flex-1 text-xs font-medium text-zinc-200 truncate min-w-0">
          {folder.name}
        </span>

        {/* Status indicator */}
        <FolderStatusPill status={folder.status} size="sm" />

        {/* Stale warning */}
        {isStale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="w-3 h-3 text-amber-500/80 flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-48 text-xs">
              Last indexed {Math.floor(hoursAgo(folder.lastIndexed!))}h ago — files may have changed.
            </TooltipContent>
          </Tooltip>
        )}

        {/* Reindex button */}
        {folder.status !== 'ingesting' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleReindex}
                disabled={reindexing}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded p-0.5 text-zinc-500 hover:text-indigo-400 disabled:opacity-40 transition-all"
                aria-label="Re-index folder"
              >
                <RefreshCw className={cn('w-3 h-3', reindexing && 'animate-spin')} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {reindexing ? 'Indexing…' : folder.status === 'indexed' ? 'Re-index' : 'Index now'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Delete button / confirm */}
        {confirmDelete ? (
          <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
            >
              {deleting ? '…' : 'Delete'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleDelete}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded p-0.5 text-zinc-600 hover:text-red-400 transition-all"
                aria-label="Delete folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Delete folder</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Last indexed */}
      {expanded && folder.lastIndexed && folder.status === 'indexed' && (
        <p className="pl-10 text-[10px] text-zinc-600 -mt-0.5 mb-1">
          Indexed {formatRelativeTime(new Date(folder.lastIndexed))}
        </p>
      )}

      {/* File list */}
      {expanded && (
        <div className="ml-5 border-l border-zinc-800/60 pl-2 space-y-0.5 mb-2">
          {files.length === 0 ? (
            <p className="text-[11px] text-zinc-700 py-2 pl-1">No files</p>
          ) : (
            files.map((file) => {
              const isOpen = file.id === openFileId
              const hasError = file.status === 'error' || file.status === 'skipped'

              return (
                <button
                  key={file.id}
                  onClick={() => setOpenFileId(isOpen ? null : file.id)}
                  className={cn(
                    'group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    isOpen
                      ? 'bg-indigo-500/10 border border-indigo-500/20 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent',
                  )}
                >
                  <FileIcon mimeType={file.mimeType} />
                  <span className="flex-1 text-xs truncate min-w-0">{file.name}</span>

                  {file.size && (
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 hidden group-hover:block">
                      {formatFileSize(file.size)}
                    </span>
                  )}

                  {hasError ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 cursor-help', statusDot[file.status])} />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-56 text-xs">
                        {file.errorMessage ?? DEFAULT_ERROR_MSG[file.status]}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot[file.status])} />
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

interface FileTreePanelProps {
  allFolders: IndexedFolder[]
  folderFiles: FolderWithFiles[]
  onReindex: () => void
  onDelete: (folder: IndexedFolder) => void
}

export function FileTreePanel({ allFolders, folderFiles, onReindex, onDelete }: FileTreePanelProps) {
  const { setAddFolderModalOpen } = useUIStore()

  // Folders with no files yet (added but not indexed) still need to appear
  const foldersInTree = allFolders.map((folder) => ({
    folder,
    files: folderFiles.find((ff) => ff.folder.id === folder.id)?.files ?? [],
  }))

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06] flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Folders
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setAddFolderModalOpen(true)}
              className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
              aria-label="Add folder"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Add folder</TooltipContent>
        </Tooltip>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
        {foldersInTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-xs text-zinc-600">No folders yet</p>
            <button
              onClick={() => setAddFolderModalOpen(true)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Add your first folder
            </button>
          </div>
        ) : (
          foldersInTree.map(({ folder, files }) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              files={files}
              onReindex={onReindex}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
