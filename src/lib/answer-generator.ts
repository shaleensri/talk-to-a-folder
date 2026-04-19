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
4. If the question is evaluative or analytical (e.g. "what are my chances", "how strong is this", "what would an investor think"), give a direct, grounded assessment based on the documents — strengths, weaknesses, gaps. Don't deflect or say you can't judge.
5. If the sources genuinely don't contain enough information, say so clearly and point to what IS covered.
6. Format answers with markdown: **bold** for key terms, bullet lists for multi-part answers.
7. Be concise and direct. Avoid filler phrases.`

const SUMMARIZATION_SYSTEM_PROMPT = `You are an expert research assistant. Your job is to summarize documents from a user's Google Drive folder.

RULES:
1. Use ONLY the provided source chunks. Do not use external knowledge.
2. Cite sources with [N] inline where relevant (e.g., "She studied Computer Science [1]...").
3. Every file in the sources MUST be mentioned at least briefly — even if its content is short or simple. Never silently omit a file.
4. Write a cohesive, insightful synthesis — NOT a flat list of facts. Lead with a brief overview sentence, then cover each file or theme.
5. Highlight what is notable or interesting about the content, not just what it contains.
6. Use markdown: **bold** for key terms, organized sections with headers if the content warrants it.
7. Write at the level of a smart colleague explaining the documents to someone who hasn't read them.`

const CROSS_FOLDER_SYSTEM_PROMPT = `You are an expert research assistant. Your job is to compare and contrast documents across multiple Google Drive folders.

RULES:
1. Answer using ONLY the provided source chunks. Do not use external knowledge.
2. Each source chunk is labeled with its folder name in brackets, e.g. [Folder: Q4 Strategy].
3. Cite every claim with [N] inline (e.g., "Folder A argues X [1] while Folder B shows Y [2]").
4. Organize your answer by comparison dimension, not by folder — highlight the meaningful differences and similarities.
5. If the folders cover the same topic, explicitly call out agreements and contradictions.
6. Use markdown: **bold** for key contrasts, a table if comparing structured attributes helps clarity.
7. Be direct. Avoid "both folders discuss..." — instead say what each actually says.`

const SINGLE_FILE_SYSTEM_PROMPT = `You are an expert research assistant. Your job is to answer questions about a specific document from a user's Google Drive folder.

RULES:
1. Answer using ONLY the provided source chunks from this document. Do not use external knowledge.
2. Cite every claim with [N] inline.
3. You have access to the full document content across multiple chunks — cover all sections and key points.
4. Organize your answer with headers (##) if the document has distinct sections.
5. Be thorough — the user wants to understand this document completely.
6. Use markdown: **bold** for key terms.`

/**
 * Builds the context string passed to the LLM.
 * When multiple folders are involved, each chunk is labeled with its folder name
 * so the model can attribute and compare content by source.
 */
function buildContext(
  chunks: RetrievedChunk[],
  folderNames?: Map<string, string>,
): string {
  const isMultiFolder = folderNames && folderNames.size > 1

  return chunks
    .map((chunk, i) => {
      const folderLabel =
        isMultiFolder && folderNames.has(chunk.folderId)
          ? `[Folder: ${folderNames.get(chunk.folderId)}] `
          : ''
      return `[${i + 1}] ${folderLabel}FILE: ${chunk.fileName}\n${chunk.text}`
    })
    .join('\n\n---\n\n')
}

export interface GeneratedAnswer {
  answer: string
  citations: Citation[]
  metadata: AnswerMetadata
}

/**
 * Generates a grounded answer with inline citation markers.
 * Supports single-folder Q&A, summarization, and multi-folder cross-comparison.
 */
export async function generateAnswer(
  query: string,
  retrieval: RetrievalResult,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  streamCallback?: (token: string) => void,
  folderNames?: Map<string, string>,
): Promise<GeneratedAnswer> {
  const startMs = Date.now()

  // Off-topic: skip LLM entirely, return a friendly nudge
  if (retrieval.intent === 'off_topic') {
    const offTopicAnswer = "I'm focused on your documents — ask me anything about what's in your folder. You can request summaries, dig into specific files, compare across folders, or ask questions about the content."
    if (streamCallback) streamCallback(offTopicAnswer)
    return {
      answer: offTopicAnswer,
      citations: [],
      metadata: {
        filesUsed: 0,
        chunksUsed: 0,
        confidence: 'off_topic',
        latencyMs: Date.now() - startMs,
        model: CHAT_MODEL,
      },
    }
  }

  if (!retrieval.isSupported || retrieval.selectedChunks.length === 0) {
    const latencyMs = Date.now() - startMs
    return {
      answer:
        "I couldn't find relevant content in your documents to answer that question. Your documents may not cover this topic, or it may be phrased in a way that doesn't match the indexed content.\n\nTry asking about specific topics, people, or details you know are in the files — or ask for a summary to see what's there.",
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
  const { intent } = retrieval
  const isMultiFolder = (folderNames?.size ?? 0) > 1

  const context = buildContext(retrieval.selectedChunks, folderNames)

  const systemPrompt =
    intent === 'cross_folder_compare'
      ? CROSS_FOLDER_SYSTEM_PROMPT
      : intent === 'broad_summary'
      ? SUMMARIZATION_SYSTEM_PROMPT
      : intent === 'single_file_deep'
      ? SINGLE_FILE_SYSTEM_PROMPT
      : CITATION_SYSTEM_PROMPT

  const maxTokens =
    intent === 'single_file_deep' ? 2000
    : intent === 'broad_summary' || intent === 'cross_folder_compare' ? 1500
    : 1000

  // Add a brief multi-folder preamble so the model knows the scope.
  // Suppress for single_file_deep — the answer is about one file, not the folders.
  const folderPreamble =
    isMultiFolder && folderNames && intent !== 'single_file_deep'
      ? `You have content from ${folderNames.size} folders: ${Array.from(folderNames.values()).join(', ')}.\n\n`
      : ''

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `${folderPreamble}SOURCES:\n${context}\n\nQUESTION: ${query}${retrieval.assumption ? `\n\nNOTE TO ASSISTANT: You made an assumption to answer this question: "${retrieval.assumption}". Begin your answer with that assumption as a single italic line, then give your full answer.` : ''}`,
    },
  ]

  let answer = ''

  if (streamCallback) {
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      stream: true,
      temperature: 0.1,
      max_tokens: maxTokens,
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
      max_tokens: maxTokens,
    })
    answer = completion.choices[0]?.message?.content ?? ''
  }

  const generationLatencyMs = Date.now() - startMs

  const citations = parseCitations(answer, retrieval.selectedChunks)

  const topScore = retrieval.selectedChunks[0]?.score ?? 0
  const confidence: AnswerMetadata['confidence'] =
    topScore >= 0.60 && citations.length >= 1
      ? 'high'
      : topScore >= 0.45
      ? 'medium'
      : 'low'

  const fileIds = new Set(citations.map((c) => c.fileId))

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
