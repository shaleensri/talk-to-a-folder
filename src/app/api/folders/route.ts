import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getFoldersForUser, createFolder } from '@/services/folder-service'
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

  if (!body.driveUrl?.trim()) {
    return NextResponse.json<ApiResponse<never>>(
      { error: 'driveUrl is required' },
      { status: 400 },
    )
  }

  // Get the Google access token from the DB (stored by NextAuth)
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: 'google' },
    select: { access_token: true },
  })

  if (!account?.access_token) {
    return NextResponse.json<ApiResponse<never>>(
      { error: 'Google access token not found. Please sign in again.' },
      { status: 401 },
    )
  }

  try {
    const folder = await createFolder(
      body.driveUrl.trim(),
      session.user.id,
      account.access_token,
    )
    return NextResponse.json({ folder }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder'
    return NextResponse.json<ApiResponse<never>>({ error: message }, { status: 400 })
  }
}
