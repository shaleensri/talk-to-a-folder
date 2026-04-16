import { parseFile } from '@/lib/file-parsers'
import { chunkText } from '@/lib/chunker'
import { embeddings } from '@/lib/embeddings'
import { vectorStore } from '@/lib/vector-store'
import {
  updateFolderStatus,
  updateFileStatus,
  discoverAndSaveFiles,
} from './folder-service'
import { prisma } from '@/lib/prisma'
import type { IndexedFolder, DriveFile, IngestionProgress } from '@/types'

// In-memory progress map so the status polling endpoint can read it
// In a production system this would live in Redis or a DB field
const progressMap = new Map<string, IngestionProgress>()

export function getIngestionProgress(folderId: string): IngestionProgress | null {
  return progressMap.get(folderId) ?? null
}

function setProgress(update: IngestionProgress) {
  progressMap.set(update.folderId, update)
}

// ---------------------------------------------------------------------------
// Full ingestion pipeline
// ---------------------------------------------------------------------------

export async function ingestFolder(
  folder: IndexedFolder,
  accessToken: string,
): Promise<void> {
  const { id: folderId } = folder

  // Mark folder as ingesting
  await updateFolderStatus(folderId, 'ingesting', { errorMessage: null })

  setProgress({
    folderId,
    status: 'ingesting',
    progress: { total: 0, parsed: 0, indexed: 0, failed: 0, skipped: 0 },
  })

  try {
    // 1. Discover files from Drive
    const files = await discoverAndSaveFiles(folder, accessToken)

    setProgress({
      folderId,
      status: 'ingesting',
      progress: {
        total: files.length,
        parsed: 0,
        indexed: 0,
        failed: 0,
        skipped: 0,
      },
    })

    // 2. Delete old chunks for this folder so re-indexing is clean
    await vectorStore.deleteByFolder(folderId)

    // 3. Process each file
    let parsed = 0
    let indexed = 0
    let failed = 0
    let skipped = 0
    let totalChunks = 0

    for (const file of files) {
      setProgress({
        folderId,
        status: 'ingesting',
        currentFile: file.name,
        progress: {
          total: files.length,
          parsed,
          indexed,
          failed,
          skipped,
        },
      })

      try {
        await updateFileStatus(file.id, 'parsing')

        // Parse file content
        const parsedFile = await parseFile(file, accessToken)

        if (!parsedFile.content.trim()) {
          await updateFileStatus(file.id, 'skipped')
          skipped++
          continue
        }

        parsed++

        // Chunk the text
        const chunks = chunkText(parsedFile.content, file.id, folderId)

        if (chunks.length === 0) {
          await updateFileStatus(file.id, 'skipped')
          skipped++
          continue
        }

        // Embed all chunks (batch for efficiency)
        const texts = chunks.map((c) => c.text)
        const embeddingVectors = await embeddings.embedBatch(texts)

        // Upsert into vector store
        await vectorStore.upsert(
          chunks.map((chunk, i) => ({
            id: chunk.id,
            embedding: embeddingVectors[i],
            metadata: {
              folderId: chunk.folderId,
              fileId: chunk.fileId,
              fileName: file.name,
              text: chunk.text,
              chunkIndex: chunk.chunkIndex,
            },
          })),
        )

        totalChunks += chunks.length
        indexed++

        await updateFileStatus(file.id, 'indexed', { parsedAt: new Date() })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Failed to process file ${file.name}:`, message)
        await updateFileStatus(file.id, 'error', { errorMessage: message })
        failed++
      }
    }

    // 4. Mark folder as indexed
    await updateFolderStatus(folderId, 'indexed', {
      fileCount: indexed,
      chunkCount: totalChunks,
      lastIndexed: new Date(),
      errorMessage: null,
    })

    setProgress({
      folderId,
      status: 'indexed',
      progress: {
        total: files.length,
        parsed,
        indexed,
        failed,
        skipped,
      },
    })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Ingestion failed'
    const message = rawMessage.includes('404') || rawMessage.toLowerCase().includes('not found')
      ? 'Folder not found on Google Drive. It may have been deleted or moved. You can remove it here.'
      : rawMessage
    console.error(`Ingestion failed for folder ${folderId}:`, rawMessage)

    await updateFolderStatus(folderId, 'error', { errorMessage: message })

    setProgress({
      folderId,
      status: 'error',
      errorMessage: message,
      progress: progressMap.get(folderId)?.progress ?? {
        total: 0,
        parsed: 0,
        indexed: 0,
        failed: 0,
        skipped: 0,
      },
    })
  }
}
