import { prisma } from './prisma'
import type { VectorRecord, VectorMatch } from '@/types'
import { TOP_K_RETRIEVAL } from '@/constants'

/**
 * Clean interface for vector stores.
 * The Prisma implementation is appropriate for dev/small scale.
 * For prod, implement PineconeVectorStore or QdrantVectorStore here.
 */
export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>
  query(embedding: number[], topK: number, filter?: { folderIds?: string[] }): Promise<VectorMatch[]>
  /** Returns the first chunk of every file in the given folders — used for full-folder summarization. */
  getFirstChunksPerFile(folderIds: string[]): Promise<VectorMatch[]>
  delete(ids: string[]): Promise<void>
  deleteByFolder(folderId: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ---------------------------------------------------------------------------
// Prisma/SQLite implementation
// Embeddings stored as JSON strings (SQLite doesn't have vector type).
// For production on Postgres, use pgvector extension instead.
// ---------------------------------------------------------------------------

export class PrismaVectorStore implements VectorStore {
  async upsert(records: VectorRecord[]): Promise<void> {
    // Use upsert with create + update for each record
    await prisma.$transaction(
      records.map((record) =>
        prisma.textChunk.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            folderId: record.metadata.folderId,
            fileId: record.metadata.fileId,
            text: record.metadata.text,
            chunkIndex: record.metadata.chunkIndex,
            startChar: 0,
            endChar: record.metadata.text.length,
            embedding: JSON.stringify(record.embedding),
          },
          update: {
            embedding: JSON.stringify(record.embedding),
          },
        }),
      ),
    )
  }

  async query(
    embedding: number[],
    topK: number = TOP_K_RETRIEVAL,
    filter?: { folderIds?: string[] },
  ): Promise<VectorMatch[]> {
    // Fetch all chunks for the specified folders (or all if no filter)
    // This is fine for dev with hundreds of chunks.
    // For scale, use pgvector or a dedicated vector DB.
    const where = filter?.folderIds?.length ? { folderId: { in: filter.folderIds } } : {}
    const chunks = await prisma.textChunk.findMany({
      where: { ...where, embedding: { not: null } },
      select: {
        id: true,
        text: true,
        folderId: true,
        fileId: true,
        chunkIndex: true,
        embedding: true,
        file: { select: { name: true } },
      },
    })

    // Compute similarity and sort
    const scored = chunks
      .map((chunk) => {
        const chunkEmbedding: number[] = JSON.parse(chunk.embedding!)
        const score = cosineSimilarity(embedding, chunkEmbedding)
        return {
          id: chunk.id,
          score,
          metadata: {
            folderId: chunk.folderId,
            fileId: chunk.fileId,
            fileName: chunk.file.name,
            text: chunk.text,
            chunkIndex: chunk.chunkIndex,
          },
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return scored
  }

  async getFirstChunksPerFile(folderIds: string[]): Promise<VectorMatch[]> {
    // Fetch chunkIndex=0 for every indexed file in these folders.
    // This guarantees one representative chunk per file regardless of query similarity —
    // ideal for "overview" / "what's in this folder" queries.
    const chunks = await prisma.textChunk.findMany({
      where: {
        folderId: { in: folderIds },
        chunkIndex: 0,
      },
      select: {
        id: true,
        text: true,
        folderId: true,
        fileId: true,
        chunkIndex: true,
        file: { select: { name: true } },
      },
      orderBy: { fileId: 'asc' },
    })

    return chunks.map((chunk) => ({
      id: chunk.id,
      score: 1.0, // no relevance scoring — all files are equally included
      metadata: {
        folderId: chunk.folderId,
        fileId: chunk.fileId,
        fileName: chunk.file.name,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
      },
    }))
  }

  async delete(ids: string[]): Promise<void> {
    await prisma.textChunk.deleteMany({ where: { id: { in: ids } } })
  }

  async deleteByFolder(folderId: string): Promise<void> {
    await prisma.textChunk.deleteMany({ where: { folderId } })
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const vectorStore: VectorStore = new PrismaVectorStore()
