import type { ParsedFile, DriveFile } from '@/types'
import { exportGoogleFile, downloadFile } from '@/lib/google-drive'
import { parseGoogleDoc } from './google-doc'
import { parseGoogleSheet } from './google-sheet'
import { parsePDF } from './pdf'
import { parsePlainText } from './plain-text'

/**
 * Dispatches to the right parser based on the file's mimeType.
 */
export async function parseFile(
  file: DriveFile,
  accessToken: string,
): Promise<ParsedFile> {
  const { driveFileId, mimeType, id: fileId, name: fileName } = file

  switch (mimeType) {
    case 'application/vnd.google-apps.document': {
      const content = await exportGoogleFile(driveFileId, mimeType, accessToken)
      return parseGoogleDoc(content, fileId, fileName)
    }

    case 'application/vnd.google-apps.spreadsheet': {
      const content = await exportGoogleFile(driveFileId, mimeType, accessToken)
      return parseGoogleSheet(content, fileId, fileName)
    }

    case 'application/pdf': {
      const buffer = await downloadFile(driveFileId, accessToken)
      return parsePDF(buffer, fileId, fileName)
    }

    case 'text/plain':
    case 'text/markdown':
    case 'text/csv': {
      const buffer = await downloadFile(driveFileId, accessToken)
      return parsePlainText(buffer.toString('utf-8'), fileId, fileName, mimeType)
    }

    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`)
  }
}
