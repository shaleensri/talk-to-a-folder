import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderById, getFilesForFolder } from '@/services/folder-service'
import type { ApiResponse } from '@/types'

type Params = { params: { folderId: string } }

// GET /api/folders/[folderId]/files
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  const folder = await getFolderById(params.folderId, session.user.id)
  if (!folder) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Not found' }, { status: 404 })
  }

  try {
    const files = await getFilesForFolder(params.folderId)
    return NextResponse.json({ files })
  } catch (err) {
    console.error('[GET /api/folders/:id/files]', err)
    return NextResponse.json<ApiResponse<never>>(
      { error: 'Failed to fetch files' },
      { status: 500 },
    )
  }
}
