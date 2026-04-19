import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderById, deleteFolder } from '@/services/folder-service'
import type { ApiResponse } from '@/types'

type Params = { params: { folderId: string } }

// GET /api/folders/[folderId]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  const folder = await getFolderById(params.folderId, session.user.id)
  if (!folder) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ folder })
}

// DELETE /api/folders/[folderId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteFolder(params.folderId, session.user.id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/folders/:id]', err)
    return NextResponse.json<ApiResponse<never>>(
      { error: 'Failed to delete folder' },
      { status: 500 },
    )
  }
}
