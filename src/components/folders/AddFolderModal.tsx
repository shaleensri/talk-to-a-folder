'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { FolderOpen, Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
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
import { IngestionProgress } from './IngestionProgress'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { MOCK_FOLDERS, MOCK_INGESTION_STEPS, MOCK_FILES } from '@/lib/mock-data'
import { scaleIn } from '@/constants/animations'
import { cn } from '@/lib/utils'
import type { IngestionProgress as IngestionProgressType, DriveFile } from '@/types'

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

type ModalStep = 'input' | 'validating' | 'ingesting' | 'done' | 'error'

interface DriveFolder { id: string; name: string }

interface AddFolderModalProps {
  onFolderAdded?: () => void
}

export function AddFolderModal({ onFolderAdded }: AddFolderModalProps) {
  const { addFolderModalOpen, setAddFolderModalOpen } = useUIStore()
  const { addTab } = useChatStore()

  const [step, setStep] = useState<ModalStep>('input')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<IngestionProgressType | null>(null)
  const [progressFiles, setProgressFiles] = useState<DriveFile[]>([])

  // Drive folder picker state
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [foldersError, setFoldersError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DriveFolder | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Fetch Drive folders when modal opens
  useEffect(() => {
    if (!addFolderModalOpen || IS_MOCK) return
    setFoldersLoading(true)
    setFoldersError(null)
    fetch('/api/drive/folders')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load folders')
        setDriveFolders(data.folders)
      })
      .catch((err) => {
        setFoldersError(err.message ?? 'Could not load your Drive folders')
      })
      .finally(() => setFoldersLoading(false))
  }, [addFolderModalOpen])

  // Focus search when folders load
  useEffect(() => {
    if (!foldersLoading && driveFolders.length > 0) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [foldersLoading, driveFolders.length])

  function reset() {
    setStep('input')
    setError(null)
    setProgress(null)
    setProgressFiles([])
    setSearch('')
    setSelected(null)
    setDriveFolders([])
    setFoldersError(null)
  }

  function handleClose() {
    if (step === 'ingesting') return
    setAddFolderModalOpen(false)
    setTimeout(reset, 300)
  }

  const handleSubmit = useCallback(async () => {
    if (!selected && !IS_MOCK) return

    setError(null)
    setStep('validating')

    if (IS_MOCK) {
      await new Promise((r) => setTimeout(r, 800))
      setStep('ingesting')
      for (let i = 0; i < MOCK_INGESTION_STEPS.length; i++) {
        const s = MOCK_INGESTION_STEPS[i]
        setProgress(s)
        const mockFiles = MOCK_FILES['mock-folder-q4-strategy']
        setProgressFiles(
          mockFiles.slice(0, s.progress.parsed).map((f, idx) => ({
            ...f,
            status: idx < s.progress.indexed ? 'indexed' : 'parsing',
          }))
        )
        await new Promise((r) => setTimeout(r, i === 0 ? 600 : 900))
      }
      setStep('done')
      setTimeout(() => {
        addTab([MOCK_FOLDERS[0].id])
        onFolderAdded?.()
        setAddFolderModalOpen(false)
        setTimeout(reset, 300)
      }, 1500)
      return
    }

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFolderId: selected!.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create folder')

      const folder = data.folder
      setStep('ingesting')

      await fetch(`/api/folders/${folder.id}/ingest`, { method: 'POST' })

      const poll = async () => {
        const statusRes = await fetch(`/api/folders/${folder.id}/status`)
        const statusData = await statusRes.json()
        setProgress(statusData.status)

        if (statusData.status.status === 'indexed') {
          setStep('done')
          setTimeout(() => {
            addTab([folder.id])
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
  }, [selected, addTab, setAddFolderModalOpen, onFolderAdded])

  const filtered = search.trim()
    ? driveFolders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : driveFolders

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
            Choose a folder from your Google Drive. We'll parse and index all
            supported files so you can ask questions about them.
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
              className="space-y-2"
            >
              {/* Search box */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search folders…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Folder list */}
              <div className="h-56 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950">
                {foldersLoading && (
                  <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Loading your Drive folders…</span>
                  </div>
                )}

                {!foldersLoading && foldersError && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                    <AlertCircle className="w-4 h-4 text-red-400/70" />
                    <p className="text-xs text-zinc-500">{foldersError}</p>
                  </div>
                )}

                {!foldersLoading && !foldersError && filtered.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-zinc-600">
                      {search ? 'No folders match your search' : 'No folders found in your Drive'}
                    </p>
                  </div>
                )}

                {!foldersLoading && !foldersError && filtered.map((folder) => {
                  const isSelected = selected?.id === folder.id
                  return (
                    <button
                      key={folder.id}
                      onClick={() => setSelected(isSelected ? null : folder)}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-indigo-500/10 text-indigo-200'
                          : 'text-zinc-300 hover:bg-zinc-800/60',
                      )}
                    >
                      <FolderOpen className={cn('w-3.5 h-3.5 flex-shrink-0', isSelected ? 'text-indigo-400' : 'text-zinc-500')} />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  )
                })}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-xs text-red-400"
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <p className="text-xs text-zinc-600">
                Supported: Google Docs, Sheets, PDFs, plain text, Markdown, Excel
              </p>
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
                disabled={(!IS_MOCK && !selected) || step === 'validating'}
                size="sm"
                className="gap-1.5"
              >
                {step === 'validating' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Validating…
                  </>
                ) : selected ? (
                  `Index "${selected.name}"`
                ) : (
                  'Select a folder'
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
