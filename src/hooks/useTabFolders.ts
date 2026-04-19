'use client'

import { useState, useEffect } from 'react'
import { MOCK_FOLDERS, MOCK_FILES } from '@/lib/mock-data'
import type { IndexedFolder, DriveFile } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

export interface FolderWithFiles {
  folder: IndexedFolder
  files: DriveFile[]
}

interface UseTabFoldersResult {
  folderFiles: FolderWithFiles[]
  isLoading: boolean
  refetch: () => void
}

/**
 * Fetches folder metadata and file lists for all folders in the active tab.
 * Runs all requests in parallel. Replaces the single-folder useFolder() call
 * in AppShell so the Files panel can show all folders' files grouped.
 */
export function useTabFolders(folderIds: string[]): UseTabFoldersResult {
  const [folderFiles, setFolderFiles] = useState<FolderWithFiles[]>([])
  const [isLoading, setIsLoading] = useState(false)

  async function load() {
    if (folderIds.length === 0) {
      setFolderFiles([])
      return
    }

    setIsLoading(true)
    try {
      if (IS_MOCK) {
        await new Promise((r) => setTimeout(r, 150))
        const results: FolderWithFiles[] = folderIds
          .map((id) => {
            const folder = MOCK_FOLDERS.find((f) => f.id === id) ?? null
            if (!folder) return null
            return { folder, files: MOCK_FILES[id] ?? MOCK_FILES[MOCK_FOLDERS[0].id] ?? [] }
          })
          .filter((r): r is FolderWithFiles => r !== null)
        setFolderFiles(results)
      } else {
        const results = await Promise.all(
          folderIds.map(async (id) => {
            const [folderRes, filesRes] = await Promise.all([
              fetch(`/api/folders/${id}`),
              fetch(`/api/folders/${id}/files`),
            ])
            if (!folderRes.ok) return null
            const folderData = await folderRes.json()
            const filesData = await filesRes.json()
            const folder: IndexedFolder = folderData.folder
            const files: DriveFile[] = filesData.files ?? []
            return { folder, files }
          }),
        )
        setFolderFiles(results.filter((r): r is FolderWithFiles => r !== null))
      }
    } catch {
      // silently ignore — files panel is non-critical
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [folderIds.join(',')])

  return { folderFiles, isLoading, refetch: load }
}
