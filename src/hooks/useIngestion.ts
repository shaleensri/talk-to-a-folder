'use client'

import { useState, useEffect, useRef } from 'react'
import type { IngestionProgress } from '@/types'

interface UseIngestionResult {
  progress: IngestionProgress | null
  isPolling: boolean
  startPolling: (folderId: string) => void
  stopPolling: () => void
}

/** Polls the ingestion status endpoint until the folder is indexed or errors. */
export function useIngestion(): UseIngestionResult {
  const [progress, setProgress] = useState<IngestionProgress | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }

  function startPolling(folderId: string) {
    stopPolling()
    setIsPolling(true)

    async function poll() {
      try {
        const res = await fetch(`/api/folders/${folderId}/status`)
        if (!res.ok) return
        const data = await res.json()
        const status: IngestionProgress = data.data.status
        setProgress(status)

        if (status.status === 'indexed' || status.status === 'error') {
          stopPolling()
        }
      } catch {
        // Ignore transient errors, keep polling
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 1500)
  }

  useEffect(() => () => stopPolling(), [])

  return { progress, isPolling, startPolling, stopPolling }
}
