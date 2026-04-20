'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use CDN-hosted worker matching the installed pdfjs-dist version.
// import.meta.url doesn't survive Next.js webpack bundling, so CDN is the reliable approach.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
}

export function PdfViewer({ url }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [loading, setLoading] = useState(true)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
    setLoading(false)
  }, [])

  function prevPage() { setPageNumber((p) => Math.max(1, p - 1)) }
  function nextPage() { setPageNumber((p) => Math.min(numPages, p + 1)) }
  function zoomIn() { setScale((s) => Math.min(2.0, parseFloat((s + 0.2).toFixed(1)))) }
  function zoomOut() { setScale((s) => Math.max(0.5, parseFloat((s - 0.2).toFixed(1)))) }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* PDF toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-zinc-950/80 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={prevPage}
            disabled={pageNumber <= 1}
            className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-zinc-500 tabular-nums px-1">
            {pageNumber} / {numPages || '—'}
          </span>
          <button
            onClick={nextPage}
            disabled={pageNumber >= numPages}
            className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-zinc-600 tabular-nums w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 2.0}
            className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PDF canvas */}
      <div className="flex-1 overflow-auto min-h-0 bg-zinc-900/30">
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading PDF…</span>
          </div>
        )}
        <div className={cn('flex justify-center py-4', loading && 'hidden')}>
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
            className="shadow-2xl"
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="border border-zinc-800"
            />
          </Document>
        </div>
      </div>
    </div>
  )
}
