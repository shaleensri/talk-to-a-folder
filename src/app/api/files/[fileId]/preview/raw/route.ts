import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken } from '@/lib/google-auth'
import { downloadFile } from '@/lib/google-drive'

type Params = { params: { fileId: string } }

/**
 * GET /api/files/[fileId]/preview/raw
 *
 * Streams the raw bytes of a PDF file so the react-pdf viewer can load it.
 * Only supports application/pdf — other types are served via the parent route.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const file = await prisma.driveFile.findFirst({
    where: {
      id: params.fileId,
      mimeType: 'application/pdf',
      folder: { userId: session.user.id },
    },
    select: { driveFileId: true, name: true },
  })

  if (!file) {
    return new NextResponse('Not found', { status: 404 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(session.user.id)
  } catch {
    return new NextResponse('Failed to get access token', { status: 401 })
  }

  try {
    const buffer = await downloadFile(file.driveFileId, accessToken)
    // Slice into an independent ArrayBuffer — avoids BodyInit type conflicts with Buffer
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
        // Allow react-pdf to fetch this cross-origin within the same domain
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load PDF'
    return new NextResponse(message, { status: 500 })
  }
}
