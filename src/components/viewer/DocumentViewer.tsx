'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  FileText, Loader2, AlertCircle, FileX,
  ExternalLink, MousePointer2, MessageSquare, Copy, Plus, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableViewer } from './TableViewer'
import { useChatStore } from '@/store/chat-store'
import type { DriveFile, IndexedFolder } from '@/types'

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
// URL helpers
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

// ---------------------------------------------------------------------------
// MIME type sets
// ---------------------------------------------------------------------------

// Rendered via Google Drive iframe (perfect formatting, but cross-origin → no text selection)
const IFRAME_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  // Note: XLS/XLSX intentionally excluded — rendered via our TableViewer for text selection support
])

// Subset of iframe types that can also be exported to HTML for select mode
const SELECT_MODE_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

// Non-iframe types fetched from our /preview API
const RENDERABLE: Record<string, 'text' | 'pdf' | 'table'> = {
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'table',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table',
  'application/vnd.ms-excel': 'table',
}

function viewerType(mimeType: string): 'iframe' | 'text' | 'pdf' | 'table' | 'unsupported' {
  if (IFRAME_MIME_TYPES.has(mimeType)) return 'iframe'
  return RENDERABLE[mimeType] ?? 'unsupported'
}

// ---------------------------------------------------------------------------
// Empty / unsupported / loading / error states
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

function UnsupportedState({ fileName }: { fileName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <FileX className="w-6 h-6 text-zinc-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-400">Preview not available</p>
        <p className="text-xs text-zinc-600 mt-1 max-w-xs">
          <span className="text-zinc-400">{fileName}</span> can&apos;t be previewed in this viewer,
          but you can still ask the chat questions about it.
        </p>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-xs">Loading preview…</span>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
      <AlertCircle className="w-6 h-6 text-red-400/70" />
      <p className="text-xs text-zinc-500">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text viewer (plain text / markdown)
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
// Google Drive iframe viewer
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
// Selection popover — shown after user highlights text in select mode
// ---------------------------------------------------------------------------
interface PopoverPos { x: number; y: number }

function chatTabLabel(tab: { folderIds: string[] }, allFolders: IndexedFolder[]): string {
  const names = tab.folderIds.map((id) => allFolders.find((f) => f.id === id)?.name ?? 'Chat')
  return names[0] ?? 'Chat'
}

interface SelectionPopoverProps {
  text: string
  pos: PopoverPos
  fileId: string   // DriveFile.id — pinned to retrieval
  folderId: string // IndexedFolder.id — used to find matching tabs
  allFolders: IndexedFolder[]
  onDismiss: () => void
}

function SelectionPopover({ text, pos, fileId, folderId, allFolders, onDismiss }: SelectionPopoverProps) {
  const { tabs, addTab, setActiveTabId, setTabQuotedText } = useChatStore()
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const matchingTabs = tabs.filter((t) => t.folderIds.includes(folderId))

  // Dismiss on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onDismiss])

  // Clamp to viewport
  const [adjustedPos, setAdjustedPos] = useState(pos)
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let { x, y } = pos
    if (x + rect.width > vw - 8) x = vw - rect.width - 8
    if (y + rect.height > vh - 8) y = pos.y - rect.height - 24
    setAdjustedPos({ x, y })
  }, [pos])

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => { setCopied(false); onDismiss() }, 800)
  }

  function sendToTab(tabId: string) {
    setTabQuotedText(tabId, { text, fileId })
    setActiveTabId(tabId)
    onDismiss()
  }

  function handleAskChat() {
    if (matchingTabs.length === 0) {
      // No matching tabs — auto-create silently (nothing to choose from)
      const newId = addTab([folderId])
      setTabQuotedText(newId, { text, fileId })
      onDismiss()
    } else {
      // 1 or more matching tabs — always show submenu so user can pick or create new
      setSubmenuOpen((v) => !v)
    }
  }

  function handleNewTab() {
    const newId = addTab([folderId])
    setTabQuotedText(newId, { text, fileId })
    onDismiss()
  }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: adjustedPos.x, top: adjustedPos.y }}
      className="z-[100] flex flex-col min-w-[160px] rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/50 overflow-hidden"
    >
      {/* Main actions */}
      <div className="flex">
        <button
          onClick={handleAskChat}
          className="flex items-center gap-1.5 flex-1 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          Ask chat
          {matchingTabs.length > 0 && (
            <span className="ml-auto text-zinc-500">({matchingTabs.length})</span>
          )}
        </button>
        <div className="w-px bg-zinc-800" />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Submenu — shown when multiple matching tabs exist */}
      {submenuOpen && (
        <div className="border-t border-zinc-800">
          {matchingTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => sendToTab(tab.id)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-left"
            >
              <MessageSquare className="w-3 h-3 text-indigo-400/60 flex-shrink-0" />
              <span className="truncate max-w-[140px]">{chatTabLabel(tab, allFolders)}</span>
            </button>
          ))}
          <button
            onClick={handleNewTab}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-indigo-400 hover:bg-zinc-800 transition-colors border-t border-zinc-800"
          >
            <Plus className="w-3 h-3 flex-shrink-0" />
            New chat
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HTML viewer — used in select mode; renders sanitized HTML from the API.
// Listens for mouseup to detect text selection and show the popover.
// ---------------------------------------------------------------------------
interface HtmlViewerProps {
  content: string
  fileId: string
  folderId: string
  allFolders: IndexedFolder[]
}

function HtmlViewer({ content, fileId, folderId, allFolders }: HtmlViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{ text: string; pos: PopoverPos } | null>(null)

  const handleMouseUp = useCallback((e: MouseEvent) => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (text.length > 0) {
      setSelection({ text, pos: { x: e.clientX, y: e.clientY + 14 } })
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('mouseup', handleMouseUp)
    return () => el.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  function handleDismiss() {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <div className="relative h-full overflow-y-auto">
      {/*
        Scoped CSS reset — wins over any inline color/background styles from Word/Google Docs.
        We set a base color on the container and force all descendants to inherit it,
        stripping any document-authored colors that would be invisible on a dark background.
      */}
      <style>{`
        .html-viewer-content * {
          color: inherit !important;
          background-color: transparent !important;
          background: transparent !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className={cn(
          'html-viewer-content',
          'max-w-3xl mx-auto px-8 py-6',
          'text-sm text-zinc-200 leading-relaxed',
          // Prose-style element rules applied inline so we don't need @tailwindcss/typography
          '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-zinc-100 [&_h1]:mb-4 [&_h1]:mt-6',
          '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h2]:mb-3 [&_h2]:mt-5',
          '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mb-2 [&_h3]:mt-4',
          '[&_p]:mb-3 [&_p]:text-zinc-300',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3',
          '[&_li]:mb-1',
          '[&_table]:w-full [&_table]:border-collapse [&_table]:mb-4',
          '[&_td]:border [&_td]:border-zinc-700 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs',
          '[&_th]:border [&_th]:border-zinc-700 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:bg-zinc-800 [&_th]:font-medium',
          '[&_strong]:font-semibold [&_strong]:text-zinc-100',
          '[&_em]:italic',
          '[&_a]:text-indigo-400 [&_a]:underline',
          '[&_pre]:bg-zinc-900 [&_pre]:p-3 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:mb-3',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-400',
        )}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: content }}
      />
      {selection && (
        <SelectionPopover
          text={selection.text}
          pos={selection.pos}
          fileId={fileId}
          folderId={folderId}
          allFolders={allFolders}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DocumentViewer
// ---------------------------------------------------------------------------

interface DocumentViewerProps {
  file: DriveFile | null
  allFolders: IndexedFolder[]
}

type PreviewContent =
  | { type: 'text'; content: string }
  | { type: 'iframe'; driveFileId: string }
  | { type: 'html'; content: string }
  | { type: 'pdf'; url: string }
  | { type: 'table'; rows: string[][]; sheets?: string[]; activeSheet?: string; sheetsData?: Record<string, string[][]> }
  | { type: 'unsupported' }
  | { type: 'error'; message: string }

export function DocumentViewer({ file, allFolders }: DocumentViewerProps) {
  const [preview, setPreview] = useState<PreviewContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  // Cached HTML content for select mode — fetched once per file
  const [htmlCache, setHtmlCache] = useState<{ fileId: string; content: string } | null>(null)
  const [htmlLoading, setHtmlLoading] = useState(false)
  const [htmlError, setHtmlError] = useState<string | null>(null)

  // Text selection popover for text/PDF/table viewers (non-iframe types)
  const [nativeSelection, setNativeSelection] = useState<{ text: string; pos: PopoverPos } | null>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)

  // Reset selection when file changes
  useEffect(() => {
    setNativeSelection(null)
  }, [file?.id])

  // Mouseup listener on the content area — fires for text/pdf/table viewers
  useEffect(() => {
    const el = contentAreaRef.current
    if (!el) return

    function onMouseUp(e: MouseEvent) {
      // Don't intercept clicks inside the SelectionPopover itself
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (text.length > 0) {
        setNativeSelection({ text, pos: { x: e.clientX, y: e.clientY + 14 } })
      }
    }

    el.addEventListener('mouseup', onMouseUp)
    return () => el.removeEventListener('mouseup', onMouseUp)
  })

  function dismissNativeSelection() {
    setNativeSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  // Reset modes when file changes
  useEffect(() => {
    setSelectMode(false)
    setHtmlError(null)

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
        else if (data.type === 'table') setPreview({ type: 'table', rows: data.rows, sheets: data.sheets, activeSheet: data.activeSheet, sheetsData: data.sheetsData })
        else setPreview({ type: 'unsupported' })
      })
      .catch((err) => {
        setPreview({ type: 'error', message: err.message ?? 'Could not load preview' })
      })
      .finally(() => setLoading(false))
  }, [file?.id])

  // Fetch HTML for select mode (lazy, cached per file)
  useEffect(() => {
    if (!file || !selectMode) return
    if (!SELECT_MODE_MIME_TYPES.has(file.mimeType)) return

    // Use cache if available for this file
    if (htmlCache?.fileId === file.id) return

    setHtmlLoading(true)
    setHtmlError(null)

    fetch(`/api/files/${file.id}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load document for text selection')
        const data = await res.json()
        if (data.type === 'html' && data.content) {
          setHtmlCache({ fileId: file.id, content: data.content })
        } else {
          setHtmlError('This file format does not support text selection')
        }
      })
      .catch((err) => {
        setHtmlError(err.message ?? 'Could not load document')
      })
      .finally(() => setHtmlLoading(false))
  }, [file?.id, file?.mimeType, selectMode, htmlCache])

  const canSelectMode = file != null && SELECT_MODE_MIME_TYPES.has(file.mimeType)
  const isIframeType = file != null && viewerType(file.mimeType) === 'iframe'

  // Determine what to render in the content area
  const showSelectModeContent =
    isIframeType &&
    selectMode &&
    canSelectMode &&
    !htmlLoading &&
    !htmlError &&
    htmlCache?.fileId === file?.id

  return (
    <div className="flex flex-col h-full bg-zinc-950 min-h-0">
      {/* Viewer header */}
      {file && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
          <FileText className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="text-xs text-zinc-300 truncate font-medium flex-1">{file.name}</span>

          {/* Select text toggle — only for supported iframe types */}
          {canSelectMode && (
            <button
              onClick={() => setSelectMode((v) => !v)}
              title={selectMode ? 'Back to formatted view' : 'Enable text selection'}
              className={cn(
                'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors flex-shrink-0',
                selectMode
                  ? 'border-indigo-500/50 text-indigo-300 bg-indigo-500/10'
                  : 'border-zinc-700 text-zinc-400 hover:border-indigo-500/40 hover:text-indigo-300 hover:bg-indigo-500/10',
              )}
            >
              <MousePointer2 className="w-3 h-3" />
              <span>{selectMode ? 'Exit select mode' : 'Select text'}</span>
            </button>
          )}

          <a
            href={googleDriveUrl(file.driveFileId, file.mimeType)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors flex-shrink-0 ml-1"
            title="Open in Google"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open in Google</span>
          </a>
        </div>
      )}

      {/* Content area
          For non-iframe types (text/pdf/table) we attach a mouseup listener here
          so the SelectionPopover can appear after the user highlights text.
          Iframe types are excluded because the iframe is cross-origin.
      */}
      <div
        ref={file && !isIframeType ? contentAreaRef : undefined}
        className={cn('flex-1 min-h-0 relative', !file && 'flex items-center justify-center')}
      >
        {!file && <EmptyState />}

        {file && loading && <LoadingState />}

        {/* Plain text / markdown */}
        {file && !loading && preview?.type === 'text' && (
          <TextViewer content={preview.content} />
        )}

        {/* Iframe or select mode */}
        {file && preview?.type === 'iframe' && !selectMode && (
          <IframeViewer driveFileId={preview.driveFileId} />
        )}

        {/* Select mode: loading HTML */}
        {file && preview?.type === 'iframe' && selectMode && htmlLoading && (
          <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading document for text selection…</span>
          </div>
        )}

        {/* Select mode: error */}
        {file && preview?.type === 'iframe' && selectMode && htmlError && (
          <ErrorState message={htmlError} />
        )}

        {/* Select mode: HTML content ready */}
        {file && preview?.type === 'iframe' && showSelectModeContent && (
          <HtmlViewer
            content={htmlCache!.content}
            fileId={file.id}
            folderId={file.folderId}
            allFolders={allFolders}
          />
        )}

        {/* Non-select-mode iframe types without select mode support — just show iframe */}
        {file && preview?.type === 'iframe' && selectMode && !canSelectMode && (
          <IframeViewer driveFileId={preview.driveFileId} />
        )}

        {/* PDF */}
        {file && !loading && preview?.type === 'pdf' && (
          <PdfViewer url={preview.url} />
        )}

        {/* Table (CSV / Excel) */}
        {file && !loading && preview?.type === 'table' && (
          <TableViewer rows={preview.rows} sheets={preview.sheets} activeSheet={preview.activeSheet} sheetsData={preview.sheetsData} />
        )}

        {/* Unsupported */}
        {file && !loading && preview?.type === 'unsupported' && (
          <UnsupportedState fileName={file.name} />
        )}

        {/* Error */}
        {file && !loading && preview?.type === 'error' && (
          <ErrorState message={preview.message} />
        )}

        {/* Selection popover for text / PDF / table — not for iframe types */}
        {nativeSelection && file && !isIframeType && (
          <SelectionPopover
            text={nativeSelection.text}
            pos={nativeSelection.pos}
            fileId={file.id}
            folderId={file.folderId}
            allFolders={allFolders}
            onDismiss={dismissNativeSelection}
          />
        )}
      </div>
    </div>
  )
}
