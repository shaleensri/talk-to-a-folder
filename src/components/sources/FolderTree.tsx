'use client'

import { FileText, Sheet, File } from 'lucide-react'
import { motion } from 'framer-motion'
import { listContainer, listItem } from '@/constants/animations'
import { cn, formatFileSize, mimeTypeToExtension } from '@/lib/utils'
import type { DriveFile, IndexedFolder } from '@/types'

interface FolderTreeProps {
  folder: IndexedFolder | null
  files: DriveFile[]
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
  skipped: 'bg-zinc-800',
}

export function FolderTree({ folder, files }: FolderTreeProps) {
  if (!folder) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
        No folder selected
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3">
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
            {/* Status dot */}
            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot[file.status])} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
