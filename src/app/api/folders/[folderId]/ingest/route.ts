import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderById } from '@/services/folder-service'
import { ingestFolder } from '@/services/ingestion-service'
import { getValidAccessToken } from '@/lib/google-auth'
import type { ApiResponse } from '@/types'

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

  // Fire and forget — don't await, just kick off
  ingestFolder(folder, accessToken).catch((err) => {
    console.error(`[ingest] Background ingestion error for folder ${params.folderId}:`, err)
  })

  return NextResponse.json({ message: 'Ingestion started' }, { status: 202 })
}
