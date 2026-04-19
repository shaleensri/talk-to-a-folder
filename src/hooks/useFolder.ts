'use client'

import { useState, useEffect } from 'react'
import { MOCK_FOLDERS, MOCK_FILES } from '@/lib/mock-data'
import type { IndexedFolder, DriveFile } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

interface UseFolderResult {
  folder: IndexedFolder | null
  files: DriveFile[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useFolder(folderId: string | null): UseFolderResult {
  const [folder, setFolder] = useState<IndexedFolder | null>(null)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!folderId) {
      setFolder(null)
      setFiles([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      if (IS_MOCK) {
        await new Promise((r) => setTimeout(r, 150))
        const found = MOCK_FOLDERS.find((f) => f.id === folderId) ?? null
        setFolder(found)
        setFiles(MOCK_FILES[folderId!] ?? MOCK_FILES[MOCK_FOLDERS[0].id] ?? [])
      } else {
        const id = folderId as string
        const [folderRes, filesRes] = await Promise.all([
          fetch(`/api/folders/${id}`),
          fetch(`/api/folders/${id}/files`),
        ])
        if (!folderRes.ok) throw new Error('Failed to load folder')
        const folderData = await folderRes.json()
        const filesData = await filesRes.json()
        setFolder(folderData.folder)
        setFiles(filesData.files ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folder')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [folderId])

  return { folder, files, isLoading, error, refetch: load }
}
