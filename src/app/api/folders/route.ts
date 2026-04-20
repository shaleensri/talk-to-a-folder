import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFoldersForUser, createFolder } from '@/services/folder-service'
import { ingestFolder } from '@/services/ingestion-service'
import { getValidAccessToken } from '@/lib/google-auth'
import type { CreateFolderRequest, ApiResponse } from '@/types'

// GET /api/folders — list all folders for the authenticated user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const folders = await getFoldersForUser(session.user.id)
    return NextResponse.json({ folders })
  } catch (err) {
    console.error('[GET /api/folders]', err)
    return NextResponse.json<ApiResponse<never>>(
      { error: 'Failed to fetch folders' },
      { status: 500 },
    )
  }
}

// POST /api/folders — add a new folder
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateFolderRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<ApiResponse<never>>({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Accept either a Drive URL (legacy) or a raw folder ID (from the Drive folder picker)
  const driveUrl = body.driveUrl?.trim()
    || (body.driveFolderId?.trim()
      ? `https://drive.google.com/drive/folders/${body.driveFolderId.trim()}`
      : undefined)

  if (!driveUrl) {
    return NextResponse.json<ApiResponse<never>>(
      { error: 'driveUrl or driveFolderId is required' },
      { status: 400 },
    )
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(session.user.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get access token'
    return NextResponse.json<ApiResponse<never>>({ error: message }, { status: 401 })
  }

  try {
    const folder = await createFolder(
      driveUrl,
      session.user.id,
      accessToken,
    )

    // Auto-trigger ingestion immediately — fire and forget
    ingestFolder(folder, accessToken).catch((err) => {
      console.error(`[POST /api/folders] Background ingestion error:`, err)
    })

    return NextResponse.json({ folder }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder'
    return NextResponse.json<ApiResponse<never>>({ error: message }, { status: 400 })
  }
}
