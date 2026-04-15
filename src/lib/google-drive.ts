import { google } from 'googleapis'
import type { DriveFile, SupportedMimeType } from '@/types'
import { SUPPORTED_MIME_TYPE_LIST, MAX_FILES_PER_FOLDER } from '@/constants'
import { generateId } from './utils'

/**
 * Creates an authenticated Google Drive API client using the user's access token.
 * The access token is stored in the Account table by NextAuth.
 */
function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

/**
 * Lists all supported files in a Drive folder (non-recursive for now).
 * Returns a list of DriveFile objects ready for parsing.
 */
export async function listFolderFiles(
  folderId: string,
  accessToken: string,
  dbFolderId: string,
): Promise<DriveFile[]> {
  const drive = getDriveClient(accessToken)

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (${SUPPORTED_MIME_TYPE_LIST.map((m) => `mimeType = '${m}'`).join(' or ')})`,
    fields: 'files(id, name, mimeType, size)',
    pageSize: MAX_FILES_PER_FOLDER,
  })

  const files = res.data.files ?? []

  return files.map((f) => ({
    id: generateId(),
    folderId: dbFolderId,
    driveFileId: f.id!,
    name: f.name!,
    mimeType: f.mimeType! as SupportedMimeType,
    size: f.size ? parseInt(f.size) : null,
    status: 'pending' as const,
    parsedAt: null,
  }))
}

/**
 * Gets the folder name for a given Drive folder ID.
 */
export async function getFolderName(
  folderId: string,
  accessToken: string,
): Promise<string> {
  const drive = getDriveClient(accessToken)
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'name',
  })
  return res.data.name ?? 'Untitled Folder'
}

/**
 * Exports a Google Doc/Sheet as plain text.
 */
export async function exportGoogleFile(
  driveFileId: string,
  mimeType: string,
  accessToken: string,
): Promise<string> {
  const drive = getDriveClient(accessToken)

  const exportMimeType =
    mimeType === 'application/vnd.google-apps.spreadsheet'
      ? 'text/csv'
      : 'text/plain'

  const res = await drive.files.export(
    { fileId: driveFileId, mimeType: exportMimeType },
    { responseType: 'text' },
  )

  return res.data as string
}

/**
 * Downloads a binary file (PDF, etc.) as a Buffer.
 */
export async function downloadFile(
  driveFileId: string,
  accessToken: string,
): Promise<Buffer> {
  const drive = getDriveClient(accessToken)
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}
