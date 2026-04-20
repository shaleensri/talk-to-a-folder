'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { FileText, Loader2, AlertCircle, FileX, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableViewer } from './TableViewer'
import type { DriveFile } from '@/types'

// Dynamically import PdfViewer with SSR disabled — react-pdf uses browser APIs
// (DOMMatrix) that aren't available during Next.js server-side rendering.
const PdfViewer = dynamic(() => import('./PdfViewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-xs">Loading PDF viewer…</span>
    </div>
  ),
})

// ---------------------------------------------------------------------------
// Build the correct Google URL for a file based on its MIME type
// ---------------------------------------------------------------------------
function googleDriveUrl(driveFileId: string, mimeType: string): string {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return `https://docs.google.com/document/d/${driveFileId}/edit`
    case 'application/vnd.google-apps.spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`
    case 'application/vnd.google-apps.presentation':
      return `https://docs.google.com/presentation/d/${driveFileId}/edit`
    default:
      return `https://drive.google.com/file/d/${driveFileId}/view`
  }
}

// MIME types rendered via Google Drive iframe (no server conversion needed)
const IFRAME_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/msword',
])

// MIME types fetched from our /preview API
const RENDERABLE: Record<string, 'text' | 'pdf' | 'table'> = {
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'table',
  'application/pdf': 'pdf',
}

function viewerType(mimeType: string): 'iframe' | 'text' | 'pdf' | 'table' | 'unsupported' {
  if (IFRAME_MIME_TYPES.has(mimeType)) return 'iframe'
  return RENDERABLE[mimeType] ?? 'unsupported'
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <FileText className="w-6 h-6 text-zinc-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-400">No file selected</p>
        <p className="text-xs text-zinc-600 mt-1">
          Click a file in the left panel to preview it here
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unsupported file type
// ---------------------------------------------------------------------------
function UnsupportedState({ fileName }: { fileName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <FileX className="w-6 h-6 text-zinc-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-400">Preview not available</p>
        <p className="text-xs text-zinc-600 mt-1 max-w-xs">
          <span className="text-zinc-400">{fileName}</span> can't be previewed in this viewer,
          but you can still ask the chat questions about it.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text viewer
// ---------------------------------------------------------------------------
function TextViewer({ content }: { content: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <pre className="p-6 text-xs text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap break-words max-w-3xl mx-auto">
        {content}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Google Drive iframe viewer — renders the file using Google's own renderer.
// Handles all formatting, colors, tables, and indentation correctly.
// Uses drive.google.com/file/d/{id}/preview which works for Drive-native files
// and uploaded Office files alike.
// ---------------------------------------------------------------------------
function IframeViewer({ driveFileId }: { driveFileId: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative flex-1 h-full min-h-0">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-zinc-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading document…</span>
        </div>
      )}
      <iframe
        src={`https://drive.google.com/file/d/${driveFileId}/preview`}
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="autoplay"
        title="Document preview"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-xs">Loading preview…</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
      <AlertCircle className="w-6 h-6 text-red-400/70" />
      <p className="text-xs text-zinc-500">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DocumentViewer
// ---------------------------------------------------------------------------

interface DocumentViewerProps {
  file: DriveFile | null
}

type PreviewContent =
  | { type: 'text'; content: string }
  | { type: 'iframe'; driveFileId: string }
  | { type: 'pdf'; url: string }
  | { type: 'table'; rows: string[][]; sheets?: string[]; activeSheet?: string }
  | { type: 'unsupported' }
  | { type: 'error'; message: string }

export function DocumentViewer({ file }: DocumentViewerProps) {
  const [preview, setPreview] = useState<PreviewContent | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!file) { setPreview(null); return }

    const type = viewerType(file.mimeType)

    if (type === 'unsupported') {
      setPreview({ type: 'unsupported' })
      return
    }

    // Iframe types render directly — no API call needed
    if (type === 'iframe') {
      setPreview({ type: 'iframe', driveFileId: file.driveFileId })
      return
    }

    setLoading(true)
    setPreview(null)

    fetch(`/api/files/${file.id}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load preview')
        const data = await res.json()
        if (data.type === 'text') setPreview({ type: 'text', content: data.content })
        else if (data.type === 'pdf') setPreview({ type: 'pdf', url: data.url })
        else if (data.type === 'table') setPreview({ type: 'table', rows: data.rows, sheets: data.sheets, activeSheet: data.activeSheet })
        else setPreview({ type: 'unsupported' })
      })
      .catch((err) => {
        setPreview({ type: 'error', message: err.message ?? 'Could not load preview' })
      })
      .finally(() => setLoading(false))
  }, [file?.id])

  return (
    <div className="flex flex-col h-full bg-zinc-950 min-h-0">
      {/* Viewer header */}
      {file && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
          <FileText className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="text-xs text-zinc-300 truncate font-medium flex-1">{file.name}</span>
          <a
            href={googleDriveUrl(file.driveFileId, file.mimeType)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors flex-shrink-0 ml-2"
            title="Open in Google"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open in Google</span>
          </a>
        </div>
      )}

      {/* Content area */}
      <div className={cn('flex-1 min-h-0', !file && 'flex items-center justify-center')}>
        {!file && <EmptyState />}

        {file && loading && <LoadingState />}

        {file && !loading && preview?.type === 'text' && (
          <TextViewer content={preview.content} />
        )}

        {file && preview?.type === 'iframe' && (
          <IframeViewer driveFileId={preview.driveFileId} />
        )}

        {file && !loading && preview?.type === 'pdf' && (
          <PdfViewer url={preview.url} />
        )}

        {file && !loading && preview?.type === 'table' && (
          <TableViewer rows={preview.rows} sheets={preview.sheets} activeSheet={preview.activeSheet} />
        )}

        {file && !loading && preview?.type === 'unsupported' && (
          <UnsupportedState fileName={file.name} />
        )}

        {file && !loading && preview?.type === 'error' && (
          <ErrorState message={preview.message} />
        )}
      </div>
    </div>
  )
}
