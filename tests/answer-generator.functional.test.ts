import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RetrievalResult } from '@/lib/retrieval'
import type { RetrievedChunk } from '@/types'

const Module = require('module')

function makeChunk(index: number, score: number): RetrievedChunk {
  return {
    chunkId: `chunk-${index}`,
    fileId: `file-${index}`,
    folderId: 'folder-1',
    fileName: `File ${index}.txt`,
    text: `Evidence from file ${index}. Supporting sentence follows here.`,
    score,
    rank: index,
    selected: true,
  }
}

function makeRetrieval(
  chunks: RetrievedChunk[],
  intent: RetrievalResult['intent'] = 'targeted_fact',
  isSupported = true,
): RetrievalResult {
  return {
    selectedChunks: chunks,
    isSupported,
    folderIds: ['folder-1'],
    intent,
    debugInfo: {
      query: 'Question?',
      intent,
      retrievedChunks: chunks,
      selectedChunkIds: chunks.map((c) => c.chunkId),
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
    completionsCreate: [] as unknown[],
  }

  class MockOpenAI {
    chat = {
      completions: {
        create: async (args: { stream?: boolean; messages?: unknown[] }) => {
          calls.completionsCreate.push(args)
          if (args.stream) {
            async function* gen() {
              for (const token of options.streamTokens ?? ['Streamed ', 'answer [1]']) {
                yield { choices: [{ delta: { content: token } }] }
              }
            }
            return gen()
          }
          return {
            choices: [
              {
                message: {
                  content: options.answer ?? 'The finding is clear [1] and further supported [2].',
                },
              },
            ],
          }
        },
      },
    }
  }

  Module._load = function mockLoad(request: string) {
    if (request === 'openai') return MockOpenAI
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
  it('returns an unsupported fallback without calling OpenAI when isSupported=false', async () => {
    const { module, calls } = loadAnswerGenerator()
    const retrieval = makeRetrieval([], 'targeted_fact', false)

    const result = await module.generateAnswer('Question?', retrieval)

    assert.equal(calls.completionsCreate.length, 0)
    assert.equal(result.citations.length, 0)
    assert.equal(result.metadata.confidence, 'unsupported')
    assert.match(result.answer, /couldn't find relevant content/)
  })

  it('parses valid [N] citation markers and ignores out-of-range markers', async () => {
    const { module } = loadAnswerGenerator({
      answer: 'Alpha [1]. Invalid [99]. Beta [2][1] again.',
    })
    const retrieval = makeRetrieval([makeChunk(1, 0.75), makeChunk(2, 0.65)])

    const result = await module.generateAnswer('Question?', retrieval)

    assert.deepEqual(result.citations.map((c) => c.index), [1, 2])
    assert.deepEqual(result.citations.map((c) => c.chunkId), ['chunk-1', 'chunk-2'])
  })

  it('scores high confidence when top chunk score >= 0.7', async () => {
    const { module } = loadAnswerGenerator({ answer: 'Clear evidence [1].' })
    const retrieval = makeRetrieval([makeChunk(1, 0.75)])

    const result = await module.generateAnswer('Question?', retrieval)

    assert.equal(result.metadata.confidence, 'high')
    assert.equal(result.metadata.filesUsed, 1)
    assert.equal(result.metadata.chunksUsed, 1)
  })

  it('scores medium confidence when top chunk score is between 0.5 and 0.7', async () => {
    const { module } = loadAnswerGenerator({ answer: 'Some evidence [1].' })
    const retrieval = makeRetrieval([makeChunk(1, 0.55)])

    const result = await module.generateAnswer('Question?', retrieval)

    assert.equal(result.metadata.confidence, 'medium')
  })

  it('scores low confidence when top chunk score < 0.5', async () => {
    const { module } = loadAnswerGenerator({ answer: 'Weak evidence [1].' })
    const retrieval = makeRetrieval([makeChunk(1, 0.3)])

    const result = await module.generateAnswer('Question?', retrieval)

    assert.equal(result.metadata.confidence, 'low')
  })

  it('injects conversation history before the source-backed user prompt', async () => {
    const { module, calls } = loadAnswerGenerator()
    const retrieval = makeRetrieval([makeChunk(1, 0.7)])
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

  it('streams tokens through the callback and assembles the answer from them', async () => {
    const { module } = loadAnswerGenerator({ streamTokens: ['Streaming ', 'result [1]'] })
    const tokens: string[] = []

    const result = await module.generateAnswer(
      'Question?',
      makeRetrieval([makeChunk(1, 0.8)]),
      [],
      (token) => tokens.push(token),
    )

    assert.deepEqual(tokens, ['Streaming ', 'result [1]'])
    assert.equal(result.answer, 'Streaming result [1]')
    assert.deepEqual(result.citations.map((c) => c.index), [1])
  })

  it('populates debugInfo latency fields after generation', async () => {
    const { module } = loadAnswerGenerator()
    const retrieval = makeRetrieval([makeChunk(1, 0.7)])

    await module.generateAnswer('Question?', retrieval)

    assert.equal(retrieval.debugInfo.generationLatencyMs >= 0, true)
    assert.equal(retrieval.debugInfo.totalLatencyMs >= retrieval.debugInfo.retrievalLatencyMs, true)
  })

  it('accepts optional folderNames map without throwing', async () => {
    const { module } = loadAnswerGenerator({ answer: 'Cross-folder answer [1].' })
    const retrieval = makeRetrieval([makeChunk(1, 0.7)], 'cross_folder_compare')
    const folderNames = new Map([['folder-1', 'Marketing Docs']])

    const result = await module.generateAnswer('Compare these folders', retrieval, [], undefined, folderNames)

    assert.equal(typeof result.answer, 'string')
    assert.equal(result.answer.length > 0, true)
  })

  it('handles off_topic intent with a short conversational response', async () => {
    const { module } = loadAnswerGenerator({ answer: 'Hello there!' })
    const retrieval = makeRetrieval([], 'off_topic', false)

    const result = await module.generateAnswer('Hello!', retrieval)

    assert.equal(typeof result.answer, 'string')
    assert.equal(result.citations.length, 0)
    assert.equal(result.metadata.confidence, 'off_topic')
  })
})
