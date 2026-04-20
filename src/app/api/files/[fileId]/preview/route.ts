import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken } from '@/lib/google-auth'
import { exportGoogleFile, downloadFile } from '@/lib/google-drive'

type Params = { params: { fileId: string } }

/**
 * GET /api/files/[fileId]/preview
 *
 * Returns a renderable representation of the file for the document viewer.
 * Response shape:
 *   { type: 'text',  content: string }     — plain text / markdown / csv
 *   { type: 'html',  content: string }     — Google Doc or DOCX converted to HTML
 *   { type: 'pdf',   url: string }         — URL to the raw PDF stream route
 *   { type: 'unsupported' }               — can't render this type
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Look up file and verify ownership via the folder
  const file = await prisma.driveFile.findFirst({
    where: {
      id: params.fileId,
      folder: { userId: session.user.id },
    },
    select: {
      id: true,
      driveFileId: true,
      mimeType: true,
      name: true,
    },
  })

  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(session.user.id)
  } catch {
    return NextResponse.json({ error: 'Failed to get access token' }, { status: 401 })
  }

  try {
    switch (file.mimeType) {
      // ── Plain text / Markdown ────────────────────────────────────────────
      case 'text/plain':
      case 'text/markdown': {
        const buffer = await downloadFile(file.driveFileId, accessToken)
        return NextResponse.json({ type: 'text', content: buffer.toString('utf-8') })
      }

      // ── CSV → table ──────────────────────────────────────────────────────
      case 'text/csv': {
        const buffer = await downloadFile(file.driveFileId, accessToken)
        const csv = buffer.toString('utf-8')
        const rows = parseCsv(csv)
        return NextResponse.json({ type: 'table', rows })
      }

      // ── Google Sheet → table ─────────────────────────────────────────────
      case 'application/vnd.google-apps.spreadsheet': {
        const csv = await exportGoogleFile(file.driveFileId, file.mimeType, accessToken)
        const rows = parseCsv(csv)
        return NextResponse.json({ type: 'table', rows })
      }

      // ── Excel → table ────────────────────────────────────────────────────
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel': {
        const buffer = await downloadFile(file.driveFileId, accessToken)
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        // Parse every sheet and return all data so the viewer can switch tabs client-side
        const sheetsData: Record<string, string[][]> = {}
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name]
          const raw: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
          sheetsData[name] = raw
            .map((row) => row.map(String))
            .filter((row) => row.some((cell) => cell.trim() !== ''))
        }
        const activeSheet = workbook.SheetNames[0]
        return NextResponse.json({
          type: 'table',
          rows: sheetsData[activeSheet] ?? [],
          sheetsData,
          sheets: workbook.SheetNames,
          activeSheet,
        })
      }

      // ── Google Doc → HTML ────────────────────────────────────────────────
      case 'application/vnd.google-apps.document': {
        const html = await exportGoogleFileAsHtml(file.driveFileId, accessToken)
        return NextResponse.json({ type: 'html', content: html })
      }

      // ── DOCX → HTML via mammoth ──────────────────────────────────────────
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const buffer = await downloadFile(file.driveFileId, accessToken)
        const result = await mammoth.convertToHtml({ buffer })
        return NextResponse.json({ type: 'html', content: sanitizeHtml(result.value) })
      }

      // ── PDF → delegate to raw stream route ──────────────────────────────
      case 'application/pdf': {
        const rawUrl = `/api/files/${params.fileId}/preview/raw`
        return NextResponse.json({ type: 'pdf', url: rawUrl })
      }

      default:
        return NextResponse.json({ type: 'unsupported' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Exports a Google Doc as HTML using the Drive API's export endpoint.
 * Falls back to plain text export if HTML export fails.
 */
async function exportGoogleFileAsHtml(
  driveFileId: string,
  accessToken: string,
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${driveFileId}/export?mimeType=text%2Fhtml`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.ok) {
    const html = await res.text()
    // Strip <html>/<head>/<body> wrapper — keep just the body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    return bodyMatch ? bodyMatch[1] : html
  }

  // Fall back to plain text via existing exportGoogleFile helper
  const plainText = await exportGoogleFile(driveFileId, 'application/vnd.google-apps.document', accessToken)
  return `<pre style="white-space:pre-wrap">${escapeHtml(plainText)}</pre>`
}

/**
 * Strips inline color/background styles from HTML so our CSS controls all colors.
 * Preserves other style properties (font-size, margin, padding etc).
 * Fixes invisible text from Word documents that use white or light inline colors.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/\s*color\s*:[^;"}]+;?/gi, '')
    .replace(/\s*background(-color)?\s*:[^;"}]+;?/gi, '')
    .replace(/\s*style="\s*"/gi, '') // remove empty style attrs left behind
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields with commas and newlines.
 * Returns a 2D array of strings (rows × columns).
 */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  const lines = csv.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        let cell = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { cell += line[i++] }
        }
        cells.push(cell)
        if (line[i] === ',') i++
      } else {
        const end = line.indexOf(',', i)
        if (end === -1) { cells.push(line.slice(i).trim()); break }
        cells.push(line.slice(i, end).trim())
        i = end + 1
      }
    }
    rows.push(cells)
  }
  return rows
}
