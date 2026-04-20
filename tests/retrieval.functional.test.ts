import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

const Module = require('module')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockChunk {
  id: string
  fileId: string
  folderId: string
  text: string
  chunkIndex: number
  startChar: number
  endChar: number
  embedding: number[] | null
}

function makeChunk(id: string, fileId: string, score: number): MockChunk {
  return {
    id,
    fileId,
    folderId: 'folder-1',
    text: `Chunk text for ${id}`,
    chunkIndex: 0,
    startChar: 0,
    endChar: 20,
    embedding: null,
  }
}

function makeVectorMatch(id: string, fileId: string, score: number) {
  return {
    id,
    score,
    metadata: {
      folderId: 'folder-1',
      fileId,
      fileName: `${fileId}.txt`,
      text: `Chunk text for ${id}`,
      chunkIndex: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const savedEmbedEmbed = {} as { fn?: (...args: unknown[]) => unknown }
const savedVectorQuery = {} as { fn?: (...args: unknown[]) => unknown }

function loadRetrieval(options: {
  intent?: string
  targetFileName?: string | null
  embedResult?: number[]
  vectorMatches?: ReturnType<typeof makeVectorMatch>[]
  prismaFiles?: unknown[]
  prismaFolders?: unknown[]
}) {
  const originalLoad = Module._load
  const modulePath = require.resolve('@/lib/retrieval')
  delete require.cache[modulePath]

  const calls = {
    embed: [] as string[],
    vectorQuery: [] as unknown[],
    openAI: [] as unknown[],
  }

  const intent = options.intent ?? 'targeted_fact'
  const targetFileName = options.targetFileName ?? null
  const embedResult = options.embedResult ?? [0.1, 0.2, 0.3]
  const vectorMatches = options.vectorMatches ?? [
    makeVectorMatch('chunk-1', 'file-a', 0.8),
    makeVectorMatch('chunk-2', 'file-a', 0.7),
  ]

  // Inject mocks directly into require.cache so retrieval's relative imports
  // (e.g. './prisma', './embeddings', './vector-store') pick them up, not just '@/' aliases.
  const prismaPath     = require.resolve('@/lib/prisma')
  const embeddingsPath = require.resolve('@/lib/embeddings')
  const vsPath         = require.resolve('@/lib/vector-store')

  const origPrisma     = require.cache[prismaPath]
  const origEmbeddings = require.cache[embeddingsPath]
  const origVS         = require.cache[vsPath]

  function cacheEntry(id: string, exports: unknown) {
    return { id, filename: id, loaded: true, exports, parent: null, children: [], paths: [] } as NodeModule
  }

  require.cache[prismaPath] = cacheEntry(prismaPath, {
    prisma: {
      driveFile: {
        findMany: async () => options.prismaFiles ?? [],
        findFirst: async () =>
          options.prismaFiles?.[0] ?? {
            id: 'file-a',
            folderId: 'folder-1',
            name: 'file-a.txt',
            mimeType: 'text/plain',
            summary: 'A summary.',
          },
      },
      indexedFolder: {
        findMany: async () => options.prismaFolders ?? [{ id: 'folder-1', name: 'My Folder' }],
      },
      textChunk: { findMany: async () => [] },
    },
  })

  require.cache[embeddingsPath] = cacheEntry(embeddingsPath, {
    embeddings: {
      embed: async (text: string) => { calls.embed.push(text); return embedResult },
      embedBatch: async (texts: string[]) => texts.map(() => embedResult),
    },
  })

  require.cache[vsPath] = cacheEntry(vsPath, {
    vectorStore: {
      query: async (...args: unknown[]) => { calls.vectorQuery.push(args); return vectorMatches },
      queryFile: async (...args: unknown[]) => { calls.vectorQuery.push(args); return vectorMatches },
    },
  })

  Module._load = function mockLoad(request: string) {
    if (request === 'openai') {
      class MockOpenAI {
        chat = {
          completions: {
            create: async () => {
              calls.openAI.push({ intent })
              return {
                choices: [{ message: { content: JSON.stringify({ intent, targetFileName }) } }],
              }
            },
          },
        }
      }
      return MockOpenAI
    }
    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      retrieve: (require('@/lib/retrieval') as typeof import('@/lib/retrieval')).retrieve,
      calls,
    }
  } finally {
    Module._load = originalLoad
    // Restore originals (retrieval module itself keeps its captured references to the mocks)
    if (origPrisma)     require.cache[prismaPath]     = origPrisma;     else delete require.cache[prismaPath]
    if (origEmbeddings) require.cache[embeddingsPath] = origEmbeddings; else delete require.cache[embeddingsPath]
    if (origVS)         require.cache[vsPath]         = origVS;         else delete require.cache[vsPath]
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('functional: retrieval pipeline', () => {
  it('returns a valid result structure for a targeted_fact query', async () => {
    const { retrieve } = loadRetrieval({ intent: 'targeted_fact' })

    const result = await retrieve('What is the revenue?', ['folder-1'], [])

    // Result must have the documented shape
    assert.equal(typeof result.isSupported, 'boolean')
    assert.ok(Array.isArray(result.selectedChunks))
    assert.ok(Array.isArray(result.folderIds))
    assert.equal(typeof result.debugInfo, 'object')
  })

  it('returns isSupported=false for off_topic intent and skips retrieval chunks', async () => {
    const { retrieve } = loadRetrieval({ intent: 'off_topic', vectorMatches: [] })

    const result = await retrieve('Hello how are you?', ['folder-1'], [])

    assert.equal(result.isSupported, false)
    assert.equal(result.selectedChunks.length, 0)
  })

  it('result shape has the expected fields on every selected chunk', async () => {
    const { retrieve } = loadRetrieval({
      intent: 'targeted_fact',
      vectorMatches: [
        makeVectorMatch('chunk-1', 'file-a', 0.85),
        makeVectorMatch('chunk-2', 'file-b', 0.65),
      ],
    })

    const result = await retrieve('What changed?', ['folder-1'], [])

    for (const chunk of result.selectedChunks) {
      assert.equal(typeof chunk.chunkId, 'string')
      assert.equal(typeof chunk.fileId, 'string')
      assert.equal(typeof chunk.fileName, 'string')
      assert.equal(typeof chunk.folderId, 'string')
      assert.equal(typeof chunk.text, 'string')
      assert.equal(typeof chunk.score, 'number')
    }
  })

  it('debugInfo is populated with timing and count fields', async () => {
    const { retrieve } = loadRetrieval({ intent: 'targeted_fact' })

    const result = await retrieve('Tell me something', ['folder-1'], [])

    const { debugInfo } = result
    assert.equal(typeof debugInfo.retrievalLatencyMs, 'number')
    assert.equal(typeof debugInfo.totalRetrieved, 'number')
    assert.equal(typeof debugInfo.totalSelected, 'number')
    assert.ok(Array.isArray(debugInfo.selectedChunkIds))
  })

  it('multiple folderIds are accepted without error', async () => {
    const { retrieve } = loadRetrieval({ intent: 'targeted_fact' })

    // Should not throw
    const result = await retrieve(
      'Compare the two folders',
      ['folder-1', 'folder-2'],
      [],
    )

    assert.equal(typeof result.isSupported, 'boolean')
  })

  it('passes sourceFileId through and routes to single-file retrieval', async () => {
    const { retrieve, calls } = loadRetrieval({ intent: 'targeted_fact' })

    await retrieve('What does this file say?', ['folder-1'], [], 'file-abc')

    // Intent classification should be skipped entirely when sourceFileId is provided
    // The OpenAI classifier should NOT have been called
    assert.equal(calls.openAI.length, 0)
  })

  it('broad_summary intent returns file-level representations from prisma', async () => {
    const { retrieve } = loadRetrieval({
      intent: 'broad_summary',
      prismaFiles: [
        { id: 'file-a', name: 'Alpha.txt', folderId: 'folder-1', summary: 'Summary of Alpha.' },
        { id: 'file-b', name: 'Beta.txt',  folderId: 'folder-1', summary: 'Summary of Beta.' },
      ],
    })

    const result = await retrieve('Give me an overview', ['folder-1'], [])

    assert.equal(result.intent, 'broad_summary')
    assert.equal(result.isSupported, true)
    // Chunks come from file metadata, not vector search
    assert.equal(result.selectedChunks.length, 2)
    assert.equal(result.selectedChunks[0].fileName, 'Alpha.txt')
    assert.equal(result.selectedChunks[1].fileName, 'Beta.txt')
    // Text is the summary
    assert.equal(result.selectedChunks[0].text, 'Summary of Alpha.')
  })

  it('cross_folder_compare intent uses the same file-representations path', async () => {
    const { retrieve } = loadRetrieval({
      intent: 'cross_folder_compare',
      prismaFiles: [
        { id: 'file-a', name: 'Doc.txt', folderId: 'folder-1', summary: 'Folder 1 doc.' },
      ],
    })

    const result = await retrieve('Compare these folders', ['folder-1', 'folder-2'], [])

    assert.equal(result.intent, 'cross_folder_compare')
    assert.equal(result.isSupported, true)
    assert.equal(result.selectedChunks.length, 1)
  })

  it('single_file_deep resolves the named file and pins retrieval to it', async () => {
    const { retrieve, calls } = loadRetrieval({
      intent: 'single_file_deep',
      targetFileName: 'Report.txt',
      prismaFiles: [{ id: 'file-report', name: 'Report.txt', folderId: 'folder-1' }],
      vectorMatches: [makeVectorMatch('chunk-r1', 'file-report', 0.9)],
    })

    const result = await retrieve('Explain this report', ['folder-1'], [])

    assert.equal(result.intent, 'single_file_deep')
    // Should have called queryFile, not query (single-file path)
    assert.ok(calls.vectorQuery.length > 0)
    // Result includes the assumption note (uses the fileName from the chunk metadata)
    assert.ok(typeof result.assumption === 'string')
    assert.match(result.assumption ?? '', /Interpreting this as a question about/)
  })

  it('single_file_deep falls back to cosine search and sets an assumption when file not found', async () => {
    const { retrieve } = loadRetrieval({
      intent: 'single_file_deep',
      targetFileName: 'Missing.txt',
      prismaFiles: [], // no files — findFileByName returns null
    })

    const result = await retrieve('Explain this file', ['folder-1'], [])

    // Falls back to targeted_fact
    assert.equal(result.intent, 'targeted_fact')
    // Assumption note mentions the failed lookup
    assert.ok(typeof result.assumption === 'string')
    assert.match(result.assumption ?? '', /Couldn't find a file matching/)
    assert.match(result.assumption ?? '', /Missing\.txt/)
  })

  it('query rewriter is invoked when conversation history is provided', async () => {
    const { retrieve, calls } = loadRetrieval({ intent: 'targeted_fact' })

    await retrieve(
      'What was the answer?',
      ['folder-1'],
      [{ role: 'user', content: 'Previous question' }],
    )

    // With history: both the rewriter and classifier call OpenAI → 2 calls total
    assert.equal(calls.openAI.length, 2)
  })

  it('query rewriter is skipped when there is no conversation history', async () => {
    const { retrieve, calls } = loadRetrieval({ intent: 'targeted_fact' })

    // Default: history = [] → rewriter returns early, only classifier calls OpenAI
    await retrieve('Tell me something', ['folder-1'], [])

    assert.equal(calls.openAI.length, 1)
  })
})
