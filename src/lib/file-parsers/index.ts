import type { ParsedFile, DriveFile } from '@/types'
import { exportGoogleFile, downloadFile } from '@/lib/google-drive'
import { parseGoogleDoc } from './google-doc'
import { parseGoogleSheet } from './google-sheet'
import { parsePDF } from './pdf'
import { parsePlainText } from './plain-text'
import { parseWord } from './word'
import { parseExcel } from './excel'
import { parsePowerPoint } from './powerpoint'

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

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const buffer = await downloadFile(driveFileId, accessToken)
      return parseWord(buffer, fileId, fileName)
    }

    case 'application/msword':
      throw new Error(
        '.doc is an old Word format that is no longer in active use and cannot be parsed. ' +
        'To include this file: open it in Google Drive → right-click → "Open with Google Docs" → ' +
        'File → Download → Word (.docx). Then upload the .docx version and re-index.',
      )

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel': {
      const buffer = await downloadFile(driveFileId, accessToken)
      return parseExcel(buffer, fileId, fileName, mimeType)
    }

    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
      const buffer = await downloadFile(driveFileId, accessToken)
      return parsePowerPoint(buffer, fileId, fileName, mimeType)
    }

    case 'application/vnd.ms-powerpoint':
      throw new Error(
        '.ppt is an old PowerPoint format that is no longer in active use and cannot be parsed. ' +
        'To include this file: open it in Google Drive → right-click → "Open with Google Slides" → ' +
        'File → Download → PowerPoint (.pptx). Then upload the .pptx version and re-index.',
      )

    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`)
  }
}
