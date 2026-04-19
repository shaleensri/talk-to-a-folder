import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderById } from '@/services/folder-service'
import { ingestFolder } from '@/services/ingestion-service'
import { getValidAccessToken } from '@/lib/google-auth'
import type { ApiResponse } from '@/types'

// Allow up to 5 minutes for large folder ingestion (effective on Vercel Pro)
export const maxDuration = 300

type Params = { params: { folderId: string } }

/**
 * POST /api/folders/[folderId]/ingest
 * Kicks off the ingestion pipeline for the folder.
 * Returns immediately — the pipeline runs asynchronously.
 * Poll /status to track progress.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  const folder = await getFolderById(params.folderId, session.user.id)
  if (!folder) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Not found' }, { status: 404 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(session.user.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get access token'
    return NextResponse.json<ApiResponse<never>>({ error: message }, { status: 401 })
  }

  // Reject if already ingesting — prevents double-invocation from resetting status
  if (folder.status === 'ingesting') {
    return NextResponse.json({ message: 'Already ingesting' }, { status: 202 })
  }

  // waitUntil keeps the Vercel Lambda alive until ingestion completes,
  // even after the 202 response is sent — prevents the status getting stuck on 'ingesting'
  waitUntil(
    ingestFolder(folder, accessToken).catch((err) => {
      console.error(`[ingest] Background ingestion error for folder ${params.folderId}:`, err)
    })
  )

  return NextResponse.json({ message: 'Ingestion started' }, { status: 202 })
}
