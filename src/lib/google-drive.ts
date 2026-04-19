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

const MAX_DEPTH = 5 // prevent runaway recursion on deeply nested folders

/**
 * Lists all supported files in a Drive folder, recursively traversing subfolders.
 * File names include the relative path (e.g. "reports/Q1/revenue.docx") so the
 * LLM understands where each file lives in the hierarchy.
 */
export async function listFolderFiles(
  folderId: string,
  accessToken: string,
  dbFolderId: string,
): Promise<DriveFile[]> {
  const drive = getDriveClient(accessToken)
  const allFiles: DriveFile[] = []

  async function walk(currentFolderId: string, pathPrefix: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || allFiles.length >= MAX_FILES_PER_FOLDER) return

    // Fetch supported files in this folder
    const fileRes = await drive.files.list({
      q: `'${currentFolderId}' in parents and trashed = false and (${SUPPORTED_MIME_TYPE_LIST.map((m) => `mimeType = '${m}'`).join(' or ')})`,
      fields: 'files(id, name, mimeType, size)',
      pageSize: MAX_FILES_PER_FOLDER,
    })

    for (const f of fileRes.data.files ?? []) {
      if (allFiles.length >= MAX_FILES_PER_FOLDER) break
      allFiles.push({
        id: generateId(),
        folderId: dbFolderId,
        driveFileId: f.id!,
        name: pathPrefix ? `${pathPrefix}/${f.name!}` : f.name!,
        mimeType: f.mimeType! as SupportedMimeType,
        size: f.size ? parseInt(f.size) : null,
        status: 'pending' as const,
        parsedAt: null,
      })
    }

    // Fetch subfolders and recurse
    const folderRes = await drive.files.list({
      q: `'${currentFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name)',
      pageSize: 100,
    })

    for (const subfolder of folderRes.data.files ?? []) {
      await walk(
        subfolder.id!,
        pathPrefix ? `${pathPrefix}/${subfolder.name!}` : subfolder.name!,
        depth + 1,
      )
    }
  }

  await walk(folderId, '', 0)
  return allFiles
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
 * Exports a Google Doc/Sheet as plain text, with one retry on transient errors.
 * Google's export API can return 500 for large or complex documents.
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

  async function attempt(): Promise<string> {
    const res = await drive.files.export(
      { fileId: driveFileId, mimeType: exportMimeType },
      { responseType: 'text' },
    )
    return res.data as string
  }

  try {
    return await attempt()
  } catch (err) {
    // Parse Google API error for a readable status code
    const code = (err as { code?: number })?.code
      ?? (err as { response?: { status?: number } })?.response?.status

    if (code === 500 || code === 503) {
      // Retry once after a short delay for transient Google errors
      await new Promise((r) => setTimeout(r, 2000))
      try {
        return await attempt()
      } catch (retryErr) {
        throw new Error(
          'Google Drive could not export this file (server error). ' +
          'This usually happens with very large or complex documents. ' +
          'Try converting it to a simpler format or splitting it into smaller files.',
        )
      }
    }

    if (code === 403) {
      throw new Error(
        'Access denied — make sure this file is shared with your Google account.',
      )
    }

    // Re-throw with a cleaner message instead of raw JSON
    const message = (err as Error)?.message ?? String(err)
    const parsed = (() => { try { return JSON.parse(message) } catch { return null } })()
    const googleMsg = parsed?.error?.message
    throw new Error(googleMsg ?? message)
  }
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
