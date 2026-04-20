import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@/constants'

// text-embedding-3-small has an 8192-token limit (~4 chars/token → ~32 768 chars).
// We cap at 30 000 chars to leave headroom and avoid 400 errors on oversized inputs.
const MAX_EMBED_CHARS = 30_000

function safeTruncate(text: string): string {
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text
}

/**
 * Clean interface for embedding providers.
 * Swap implementations by changing the exported `embeddings` singleton.
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  readonly dimension: number
  readonly modelName: string
}

// ---------------------------------------------------------------------------
// OpenAI implementation
// ---------------------------------------------------------------------------

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = EMBEDDING_DIMENSIONS
  readonly modelName = EMBEDDING_MODEL

  private client: import('openai').default | null = null

  private getClient() {
    if (!this.client) {
      const OpenAI = require('openai').default
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this.client!
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.getClient().embeddings.create({
      model: this.modelName,
      input: safeTruncate(text).replace(/\n/g, ' '),
    })
    return res.data[0].embedding
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    // OpenAI supports batching up to 2048 inputs
    const BATCH_SIZE = 100
    const results: number[][] = []

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map((t) => safeTruncate(t).replace(/\n/g, ' '))
      const res = await this.getClient().embeddings.create({
        model: this.modelName,
        input: batch,
      })
      results.push(...res.data.map((d) => d.embedding))
    }

    return results
  }
}

// ---------------------------------------------------------------------------
// Mock implementation (for testing without API keys)
// ---------------------------------------------------------------------------

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 8  // tiny vectors for mock
  readonly modelName = 'mock'

  async embed(_text: string): Promise<number[]> {
    return Array.from({ length: this.dimension }, () => Math.random() * 2 - 1)
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)))
  }
}

// ---------------------------------------------------------------------------
// Singleton — swap here for different provider
// ---------------------------------------------------------------------------

export const embeddings: EmbeddingProvider =
  process.env.OPENAI_API_KEY
    ? new OpenAIEmbeddingProvider()
    : new MockEmbeddingProvider()
