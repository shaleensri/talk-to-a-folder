import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderById } from '@/services/folder-service'
import { getIngestionProgress } from '@/services/ingestion-service'
import type { ApiResponse, IngestionProgress } from '@/types'

type Params = { params: { folderId: string } }

/**
 * GET /api/folders/[folderId]/status
 * Returns current ingestion progress for a folder.
 * If the ingestion-service has an in-memory entry, use that for live progress.
 * Otherwise fall back to the DB status.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  const folder = await getFolderById(params.folderId, session.user.id)
  if (!folder) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Not found' }, { status: 404 })
  }

  // Check for live in-memory progress first
  const liveProgress = getIngestionProgress(params.folderId)
  if (liveProgress) {
    return NextResponse.json({ status: liveProgress })
  }

  // Fall back to a progress object derived from the DB folder row
  const fallback: IngestionProgress = {
    folderId: folder.id,
    status: folder.status as IngestionProgress['status'],
    progress: {
      total: folder.fileCount,
      parsed: folder.fileCount,
      indexed: folder.fileCount,
      failed: 0,
      skipped: 0,
    },
    ...(folder.errorMessage && { errorMessage: folder.errorMessage }),
  }

  return NextResponse.json({ status: fallback })
}
