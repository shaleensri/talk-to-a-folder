import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/auth'
import { getValidAccessToken } from '@/lib/google-auth'

export interface DriveFolder {
  id: string
  name: string
}

/**
 * GET /api/drive/folders
 * Returns a flat list of all non-trashed folders in the user's Google Drive.
 * Used by the Add Folder modal to let users browse instead of pasting a URL.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(session.user.id)
  } catch {
    return NextResponse.json({ error: 'Failed to get access token' }, { status: 401 })
  }

  try {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth })

    // Fetch up to 1000 folders — enough for any reasonable Drive
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      orderBy: 'name',
      pageSize: 1000,
    })

    const folders: DriveFolder[] = (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
    }))

    return NextResponse.json({ folders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list Drive folders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
