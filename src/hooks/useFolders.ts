'use client'

import { useState, useEffect } from 'react'
import { MOCK_FOLDERS } from '@/lib/mock-data'
import type { IndexedFolder } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

interface UseFoldersResult {
  folders: IndexedFolder[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useFolders(): UseFoldersResult {
  const [folders, setFolders] = useState<IndexedFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      if (IS_MOCK) {
        await new Promise((r) => setTimeout(r, 400))
        setFolders(MOCK_FOLDERS)
      } else {
        const res = await fetch('/api/folders')
        if (!res.ok) throw new Error('Failed to load folders')
        const data = await res.json()
        setFolders(data.folders)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { folders, isLoading, error, refetch: load }
}
