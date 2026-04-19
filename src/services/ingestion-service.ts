import OpenAI from 'openai'
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
import { MAX_FILE_SIZE_BYTES } from '@/constants'
import type { IndexedFolder, DriveFile, IngestionProgress } from '@/types'

// ---------------------------------------------------------------------------
// Progress tracking — stored in DB so any serverless instance can read it
// ---------------------------------------------------------------------------

export async function getIngestionProgress(folderId: string): Promise<IngestionProgress | null> {
  const folder = await prisma.indexedFolder.findUnique({
    where: { id: folderId },
    select: { progressJson: true },
  })
  if (!folder?.progressJson) return null
  try {
    return JSON.parse(folder.progressJson) as IngestionProgress
  } catch {
    return null
  }
}

// Fire-and-forget — progress writes are informational and must never block ingestion
function setProgress(update: IngestionProgress): void {
  prisma.indexedFolder.update({
    where: { id: update.folderId },
    data: { progressJson: JSON.stringify(update) },
  }).catch(() => {})
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

  await setProgress({
    folderId,
    status: 'ingesting',
    progress: { total: 0, parsed: 0, indexed: 0, failed: 0, skipped: 0 },
  })

  try {
    // 1. Discover files from Drive
    const files = await discoverAndSaveFiles(folder, accessToken)

    await setProgress({
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

    // 3. Process each file: parse → chunk → embed (sequential for stable progress tracking)
    let parsed = 0
    let indexed = 0
    let failed = 0
    let skipped = 0
    let totalChunks = 0

    // Collect parsed content for files that were successfully indexed,
    // so we can summarize them in parallel after the main loop.
    const toSummarize: { fileId: string; fileName: string; content: string }[] = []

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
        // Skip files that exceed the size limit before attempting to parse
        if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
          await updateFileStatus(file.id, 'skipped', {
            errorMessage: 'File exceeds the 20 MB size limit and was not indexed. Split it into smaller files to index it.',
          })
          skipped++
          continue
        }

        await updateFileStatus(file.id, 'parsing')

        const parsedFile = await parseFile(file, accessToken)

        if (!parsedFile.content.trim()) {
          await updateFileStatus(file.id, 'skipped', {
            errorMessage:
              'No text content found — file may be image-only, scanned, or empty.',
          })
          skipped++
          continue
        }

        parsed++

        const chunks = chunkText(parsedFile.content, file.id, folderId)

        if (chunks.length === 0) {
          await updateFileStatus(file.id, 'skipped')
          skipped++
          continue
        }

        const texts = chunks.map((c) => c.text)
        const embeddingVectors = await embeddings.embedBatch(texts)

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

        // Queue for parallel summary generation below
        toSummarize.push({ fileId: file.id, fileName: file.name, content: parsedFile.content })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Failed to process file ${file.name}:`, message)
        await updateFileStatus(file.id, 'error', { errorMessage: message })
        failed++
      }
    }

    // 4. Generate summaries in parallel batches of 5.
    //    All files are already indexed above — summaries are non-blocking and non-fatal.
    const SUMMARY_BATCH_SIZE = 5
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    for (let i = 0; i < toSummarize.length; i += SUMMARY_BATCH_SIZE) {
      const batch = toSummarize.slice(i, i + SUMMARY_BATCH_SIZE)
      await Promise.all(
        batch.map(async ({ fileId, fileName, content }) => {
          try {
            const contentForSummary = content.slice(0, 8000)
            const summaryRes = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content:
                    'Summarize this document in 3-5 sentences for a retrieval system. ' +
                    'Cover: what the document is, its main topics, and any notable specific content. ' +
                    'Be concrete and specific — avoid vague phrases like "this document covers...".',
                },
                { role: 'user', content: `FILE: ${fileName}\n\n${contentForSummary}` },
              ],
              temperature: 0,
              max_tokens: 200,
            })
            const summary = summaryRes.choices[0]?.message?.content?.trim()
            if (summary) {
              await prisma.driveFile.update({ where: { id: fileId }, data: { summary } })
            }
          } catch {
            // Summary generation failed — file is still indexed, just without a summary
          }
        }),
      )
    }

    // 4. Mark folder as indexed
    await updateFolderStatus(folderId, 'indexed', {
      fileCount: indexed,
      chunkCount: totalChunks,
      lastIndexed: new Date(),
      errorMessage: null,
    })

    await setProgress({
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

    // Read the last known progress from DB before writing the error state
    const lastProgress = await getIngestionProgress(folderId)
    await setProgress({
      folderId,
      status: 'error',
      errorMessage: message,
      progress: lastProgress?.progress ?? {
        total: 0,
        parsed: 0,
        indexed: 0,
        failed: 0,
        skipped: 0,
      },
    })
  }
}
