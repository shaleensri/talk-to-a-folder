'use client'

import { useState, useCallback } from 'react'
import { FolderOpen, Link, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IngestionProgress } from './IngestionProgress'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { extractFolderIdFromUrl } from '@/lib/utils'
import { MOCK_FOLDERS, MOCK_INGESTION_STEPS, MOCK_FILES } from '@/lib/mock-data'
import { scaleIn } from '@/constants/animations'
import type { IngestionProgress as IngestionProgressType, DriveFile } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

type ModalStep = 'input' | 'validating' | 'ingesting' | 'done' | 'error'

interface AddFolderModalProps {
  onFolderAdded?: () => void
}

export function AddFolderModal({ onFolderAdded }: AddFolderModalProps) {
  const { addFolderModalOpen, setAddFolderModalOpen } = useUIStore()
  const { addTab } = useChatStore()

  const [url, setUrl] = useState('')
  const [step, setStep] = useState<ModalStep>('input')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<IngestionProgressType | null>(null)
  const [progressFiles, setProgressFiles] = useState<DriveFile[]>([])

  function reset() {
    setUrl('')
    setStep('input')
    setError(null)
    setProgress(null)
    setProgressFiles([])
  }

  function handleClose() {
    if (step === 'ingesting') return // don't close while indexing
    setAddFolderModalOpen(false)
    setTimeout(reset, 300) // wait for dialog close animation
  }

  const handleSubmit = useCallback(async () => {
    const folderId = extractFolderIdFromUrl(url.trim())
    if (!folderId && !IS_MOCK) {
      setError('Invalid Google Drive folder URL. Make sure to copy the full link.')
      return
    }

    setError(null)
    setStep('validating')

    if (IS_MOCK) {
      // Simulate ingestion with staged steps
      await new Promise((r) => setTimeout(r, 800))
      setStep('ingesting')

      for (let i = 0; i < MOCK_INGESTION_STEPS.length; i++) {
        const step = MOCK_INGESTION_STEPS[i]
        setProgress(step)

        // Build file list as steps progress
        const mockFiles = MOCK_FILES['mock-folder-q4-strategy']
        const parsed = step.progress.parsed
        setProgressFiles(
          mockFiles.slice(0, parsed).map((f, idx) => ({
            ...f,
            status: idx < step.progress.indexed ? 'indexed' : 'parsing',
          }))
        )

        await new Promise((r) => setTimeout(r, i === 0 ? 600 : 900))
      }

      // Final state
      const newFolder = {
        ...MOCK_FOLDERS[0],
        id: `mock-folder-${Date.now()}`,
        name: 'New Indexed Folder',
        driveUrl: url || MOCK_FOLDERS[0].driveUrl,
        status: 'indexed' as const,
      }

      setStep('done')
      setTimeout(() => {
        addTab([MOCK_FOLDERS[0].id]) // open a chat tab for the new folder
        onFolderAdded?.()
        setAddFolderModalOpen(false)
        setTimeout(reset, 300)
      }, 1500)
      return
    }

    // Real mode: call API
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveUrl: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create folder')

      const folder = data.folder
      setStep('ingesting')

      // Start ingestion
      await fetch(`/api/folders/${folder.id}/ingest`, { method: 'POST' })

      // Poll for status
      const poll = async () => {
        const statusRes = await fetch(`/api/folders/${folder.id}/status`)
        const statusData = await statusRes.json()
        setProgress(statusData.status)

        if (statusData.status.status === 'indexed') {
          setStep('done')
          setTimeout(() => {
            addTab([folder.id]) // open a chat tab for the new folder
            onFolderAdded?.()
            setAddFolderModalOpen(false)
            setTimeout(reset, 300)
          }, 1500)
        } else if (statusData.status.status === 'error') {
          setStep('error')
          setError(statusData.status.errorMessage ?? 'Indexing failed')
        } else {
          setTimeout(poll, 1500)
        }
      }
      await poll()
    } catch (err) {
      setStep('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }, [url, addTab, setAddFolderModalOpen])

  const isValidUrl = IS_MOCK || !!extractFolderIdFromUrl(url.trim())

  return (
    <Dialog open={addFolderModalOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <FolderOpen className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <DialogTitle>Index a folder</DialogTitle>
          </div>
          <DialogDescription>
            Paste a Google Drive folder link. We'll parse and index all supported
            files so you can ask questions about them.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {(step === 'input' || step === 'validating') && (
            <motion.div
              key="input"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-3"
            >
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <Input
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setError(null)
                  }}
                  className="pl-9"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValidUrl) handleSubmit()
                  }}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-red-400"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </motion.div>
              )}

              <div className="text-xs text-zinc-600 space-y-0.5">
                <p>Supported: Google Docs, Sheets, PDFs, plain text, Markdown</p>
                <p>Requires: folder must be shared with your Google account</p>
              </div>
            </motion.div>
          )}

          {(step === 'ingesting' || step === 'done') && progress && (
            <motion.div
              key="progress"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              className="py-1"
            >
              <IngestionProgress progress={progress} files={progressFiles} />
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter>
          {(step === 'input' || step === 'validating') && (
            <>
              <Button variant="ghost" onClick={handleClose} size="sm">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={(!IS_MOCK && !isValidUrl) || step === 'validating'}
                size="sm"
                className="gap-1.5"
              >
                {step === 'validating' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Validating…
                  </>
                ) : (
                  'Index folder'
                )}
              </Button>
            </>
          )}

          {step === 'ingesting' && (
            <p className="text-xs text-zinc-600 text-right">
              This may take a minute for large folders…
            </p>
          )}

          {step === 'done' && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Ready to chat
            </div>
          )}

          {step === 'error' && (
            <>
              <Button variant="ghost" onClick={handleClose} size="sm">
                Close
              </Button>
              <Button onClick={() => setStep('input')} size="sm" variant="outline">
                Try again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
