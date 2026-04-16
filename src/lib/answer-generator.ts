import OpenAI from 'openai'
import type { RetrievedChunk, Citation, AnswerMetadata } from '@/types'
import type { RetrievalResult } from './retrieval'
import { CHAT_MODEL } from '@/constants'
import { generateId } from './utils'

const CITATION_SYSTEM_PROMPT = `You are an expert research assistant. Your job is to answer questions about documents in a user's Google Drive folder.

RULES:
1. Answer using ONLY the provided source chunks. Do not use external knowledge.
2. Cite every claim with [N] where N is the source number (e.g., "The report found [1]..." or "Sales grew 35% [2][3]").
3. Use [N] inline immediately after the claim it supports, not at the end of sentences.
4. If the sources don't contain enough information, say so clearly.
5. Format answers with markdown: **bold** for key terms, bullet lists for multi-part answers.
6. Be concise and direct. Avoid filler phrases.`

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] FILE: ${chunk.fileName}\n${chunk.text}`,
    )
    .join('\n\n---\n\n')
}

export interface GeneratedAnswer {
  answer: string
  citations: Citation[]
  metadata: AnswerMetadata
}

/**
 * Generates a grounded answer with inline citation markers.
 * Uses a structured prompt that forces [N] citation placement.
 */
export async function generateAnswer(
  query: string,
  retrieval: RetrievalResult,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  streamCallback?: (token: string) => void,
): Promise<GeneratedAnswer> {
  const startMs = Date.now()

  if (!retrieval.isSupported || retrieval.selectedChunks.length === 0) {
    const latencyMs = Date.now() - startMs
    return {
      answer:
        "I wasn't able to find strong evidence in the indexed folder to answer that question. The available documents don't appear to address this topic directly.\n\nTry asking about specific topics covered in your documents, or rephrase your question.",
      citations: [],
      metadata: {
        filesUsed: 0,
        chunksUsed: 0,
        confidence: 'unsupported',
        confidenceReason: 'No chunks met the minimum relevance threshold',
        latencyMs,
        model: CHAT_MODEL,
      },
    }
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const context = buildContext(retrieval.selectedChunks)

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: CITATION_SYSTEM_PROMPT },
    // Inject prior turns so the model can follow up on previous answers
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `SOURCES:\n${context}\n\nQUESTION: ${query}`,
    },
  ]

  let answer = ''

  if (streamCallback) {
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      stream: true,
      temperature: 0.1,
      max_tokens: 1000,
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      if (token) {
        answer += token
        streamCallback(token)
      }
    }
  } else {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 1000,
    })
    answer = completion.choices[0]?.message?.content ?? ''
  }

  const generationLatencyMs = Date.now() - startMs

  // Parse citations from answer text
  const citations = parseCitations(answer, retrieval.selectedChunks)

  // Determine confidence based on top score and number of sources
  const topScore = retrieval.selectedChunks[0]?.score ?? 0
  // text-embedding-3-small cosine scores typically peak at 0.55–0.75 for
  // strong matches, so thresholds are calibrated lower than raw cosine intuition.
  const confidence: AnswerMetadata['confidence'] =
    topScore >= 0.60 && citations.length >= 1
      ? 'high'
      : topScore >= 0.45
      ? 'medium'
      : 'low'

  const fileIds = new Set(citations.map((c) => c.fileId))

  // Update debug info latencies
  retrieval.debugInfo.generationLatencyMs = generationLatencyMs
  retrieval.debugInfo.totalLatencyMs =
    retrieval.debugInfo.retrievalLatencyMs + generationLatencyMs

  return {
    answer,
    citations,
    metadata: {
      filesUsed: fileIds.size,
      chunksUsed: citations.length,
      confidence,
      latencyMs: retrieval.debugInfo.totalLatencyMs,
      model: CHAT_MODEL,
    },
  }
}

/**
 * Parses [N] markers from the answer and maps them to source chunks.
 */
function parseCitations(answer: string, chunks: RetrievedChunk[]): Citation[] {
  const usedIndices = new Set<number>()
  const matches = answer.matchAll(/\[(\d+)\]/g)

  for (const match of matches) {
    usedIndices.add(parseInt(match[1]))
  }

  return Array.from(usedIndices)
    .sort((a, b) => a - b)
    .map((index) => {
      const chunk = chunks[index - 1]
      if (!chunk) return null

      // Extract a highlight span: first 100 chars of the chunk
      const highlightText = chunk.text.slice(0, 120).split('.')[0] + '.'

      const citation: Citation = {
        id: `cit-${generateId()}`,
        index,
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        chunkId: chunk.chunkId,
        chunkText: chunk.text,
        highlightText,
        relevanceScore: chunk.score,
      }
      return citation
    })
    .filter((c): c is Citation => c !== null)
}
