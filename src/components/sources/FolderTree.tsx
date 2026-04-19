'use client'

import { FileText, Sheet, File } from 'lucide-react'
import { motion } from 'framer-motion'
import { listContainer, listItem } from '@/constants/animations'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, formatFileSize } from '@/lib/utils'
import type { DriveFile, IndexedFolder } from '@/types'
import type { FolderWithFiles } from '@/hooks/useTabFolders'

interface FolderTreeProps {
  folderFiles: FolderWithFiles[]
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes('document')) return <FileText className="w-3.5 h-3.5 text-blue-400" />
  if (mimeType.includes('spreadsheet')) return <Sheet className="w-3.5 h-3.5 text-emerald-400" />
  if (mimeType === 'application/pdf') return <FileText className="w-3.5 h-3.5 text-red-400" />
  return <File className="w-3.5 h-3.5 text-zinc-500" />
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

function FolderSection({ folder, files }: { folder: IndexedFolder; files: DriveFile[] }) {
  return (
    <div className="space-y-3">
      {/* Folder header */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-300 truncate">{folder.name}</p>
          <span className="text-[10px] text-zinc-600 ml-2 flex-shrink-0">
            {folder.fileCount} files · {folder.chunkCount} chunks
          </span>
        </div>
        {folder.lastIndexed && (
          <p className="text-[10px] text-zinc-600 mt-1">
            Last indexed {new Date(folder.lastIndexed).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* File list */}
      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="visible"
        className="space-y-0.5"
      >
        {files.map((file) => (
          <motion.div
            key={file.id}
            variants={listItem}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-zinc-800/50 transition-colors group"
          >
            <FileIcon mimeType={file.mimeType} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">
                {file.name}
              </p>
              {file.size && (
                <p className="text-[10px] text-zinc-600">{formatFileSize(file.size)}</p>
              )}
            </div>
            {(file.status === 'error' || file.status === 'skipped') ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0 cursor-help',
                      statusDot[file.status],
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-56 text-xs">
                  {file.errorMessage ?? DEFAULT_ERROR_MSG[file.status]}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot[file.status])} />
            )}
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export function FolderTree({ folderFiles }: FolderTreeProps) {
  if (folderFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
        No folder selected
      </div>
    )
  }

  return (
    <div className="space-y-6 p-3">
      {folderFiles.map(({ folder, files }) => (
        <FolderSection key={folder.id} folder={folder} files={files} />
      ))}
    </div>
  )
}
