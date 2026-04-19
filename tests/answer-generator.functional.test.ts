import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RetrievalResult } from '@/lib/retrieval'
import type { RetrievedChunk } from '@/types'

const Module = require('module')

function makeChunk(index: number, score: number): RetrievedChunk {
  return {
    chunkId: `chunk-${index}`,
    fileId: `file-${index}`,
    fileName: `File ${index}.txt`,
    text: `Important evidence from file ${index}. Additional sentence for highlighting.`,
    score,
    rank: index,
    selected: true,
  }
}

function makeRetrieval(chunks: RetrievedChunk[], isSupported = true): RetrievalResult {
  return {
    selectedChunks: chunks,
    isSupported,
    folderIds: ['folder-1'],
    intent: 'targeted_fact',
    debugInfo: {
      query: 'Question?',
      intent: 'targeted_fact',
      retrievedChunks: chunks,
      selectedChunkIds: chunks.map((chunk) => chunk.chunkId),
      totalRetrieved: chunks.length,
      totalSelected: chunks.length,
      retrievalLatencyMs: 7,
      generationLatencyMs: 0,
      totalLatencyMs: 0,
    },
  }
}

function loadAnswerGenerator(options: {
  answer?: string
  streamTokens?: string[]
} = {}) {
  const originalLoad = Module._load
  const modulePath = require.resolve('@/lib/answer-generator')
  delete require.cache[modulePath]

  const calls = {
    openAI: [] as Array<{ apiKey: string | undefined }>,
    completionsCreate: [] as unknown[],
  }

  class MockOpenAI {
    chat: {
      completions: {
        create: (args: unknown) => Promise<unknown>
      }
    }

    constructor(config: { apiKey?: string }) {
      calls.openAI.push({ apiKey: config.apiKey })
      this.chat = {
        completions: {
          create: async (args: { stream?: boolean }) => {
            calls.completionsCreate.push(args)
            if (args.stream) {
              async function* stream() {
                for (const token of options.streamTokens ?? ['Streamed ', 'answer [1]']) {
                  yield { choices: [{ delta: { content: token } }] }
                }
              }
              return stream()
            }

            return {
              choices: [
                {
                  message: {
                    content: options.answer ?? 'The answer is supported [1] and corroborated [2].',
                  },
                },
              ],
            }
          },
        },
      }
    }
  }

  Module._load = function mockLoad(request: string) {
    if (request === 'openai') {
      return MockOpenAI
    }
    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      module: require('@/lib/answer-generator') as typeof import('@/lib/answer-generator'),
      calls,
    }
  } finally {
    Module._load = originalLoad
  }
}

describe('functional: answer generator', () => {
  it('returns an unsupported fallback without calling OpenAI', async () => {
    const { module, calls } = loadAnswerGenerator()
    const retrieval = makeRetrieval([], false)

    const result = await module.generateAnswer('Question?', retrieval)

    assert.equal(calls.openAI.length, 0)
    assert.equal(result.citations.length, 0)
    assert.equal(result.metadata.confidence, 'unsupported')
    assert.match(result.answer, /wasn't able to find strong evidence/)
  })

  it('parses valid citation markers, ignores invalid markers, and scores high confidence', async () => {
    const { module } = loadAnswerGenerator({
      answer: 'Alpha is true [1]. Ignore missing marker [99]. Beta is true [2][1].',
    })
    const retrieval = makeRetrieval([makeChunk(1, 0.72), makeChunk(2, 0.61)])

    const result = await module.generateAnswer('Question?', retrieval)

    assert.deepEqual(result.citations.map((citation) => citation.index), [1, 2])
    assert.deepEqual(result.citations.map((citation) => citation.chunkId), ['chunk-1', 'chunk-2'])
    assert.equal(result.metadata.confidence, 'high')
    assert.equal(result.metadata.filesUsed, 2)
    assert.equal(result.metadata.chunksUsed, 2)
    assert.equal(retrieval.debugInfo.generationLatencyMs >= 0, true)
    assert.equal(retrieval.debugInfo.totalLatencyMs >= retrieval.debugInfo.retrievalLatencyMs, true)
  })

  it('injects conversation history before the source-backed user prompt', async () => {
    const { module, calls } = loadAnswerGenerator()
    const retrieval = makeRetrieval([makeChunk(1, 0.5)])
    const history = [
      { role: 'user' as const, content: 'Earlier question' },
      { role: 'assistant' as const, content: 'Earlier answer [1]' },
    ]

    await module.generateAnswer('Follow-up?', retrieval, history)

    const createArgs = calls.completionsCreate[0] as {
      messages: Array<{ role: string; content: string }>
    }
    assert.equal(createArgs.messages[0].role, 'system')
    assert.deepEqual(createArgs.messages.slice(1, 3), history)
    assert.equal(createArgs.messages.at(-1)?.role, 'user')
    assert.match(createArgs.messages.at(-1)?.content ?? '', /SOURCES:/)
    assert.match(createArgs.messages.at(-1)?.content ?? '', /QUESTION: Follow-up\?/)
  })

  it('streams tokens through the callback and builds citations from the streamed answer', async () => {
    const { module } = loadAnswerGenerator({ streamTokens: ['Streaming ', 'works [1]'] })
    const tokens: string[] = []

    const result = await module.generateAnswer(
      'Question?',
      makeRetrieval([makeChunk(1, 0.5)]),
      [],
      (token) => tokens.push(token),
    )

    assert.deepEqual(tokens, ['Streaming ', 'works [1]'])
    assert.equal(result.answer, 'Streaming works [1]')
    assert.deepEqual(result.citations.map((citation) => citation.index), [1])
  })

  it('uses medium and low confidence thresholds', async () => {
    const medium = await loadAnswerGenerator({ answer: 'Medium support [1].' })
      .module.generateAnswer('Question?', makeRetrieval([makeChunk(1, 0.5)]))
    const low = await loadAnswerGenerator({ answer: 'Weak support [1].' })
      .module.generateAnswer('Question?', makeRetrieval([makeChunk(1, 0.31)]))

    assert.equal(medium.metadata.confidence, 'medium')
    assert.equal(low.metadata.confidence, 'low')
  })
})
