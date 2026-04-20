import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

function makeFile(mimeType: string) {
  return {
    id: 'file-1',
    folderId: 'folder-1',
    driveFileId: 'drive-file-1',
    name: 'File',
    mimeType,
    size: 100,
    status: 'pending' as const,
    parsedAt: null,
  }
}

function loadDispatcher() {
  const originalLoad = Module._load
  const modulePath = require.resolve('@/lib/file-parsers')
  delete require.cache[modulePath]

  const calls = {
    exportGoogleFile: [] as unknown[],
    downloadFile: [] as unknown[],
    parser: [] as Array<{ name: string; args: unknown[] }>,
  }

  function parsed(name: string) {
    return {
      fileId: 'file-1',
      fileName: 'File',
      mimeType: `parsed/${name}`,
      content: `parsed by ${name}`,
    }
  }

  Module._load = function mockLoad(request: string) {
    if (request === '@/lib/google-drive') {
      return {
        exportGoogleFile: async (...args: unknown[]) => {
          calls.exportGoogleFile.push(args)
          return 'exported content'
        },
        downloadFile: async (...args: unknown[]) => {
          calls.downloadFile.push(args)
          return Buffer.from('downloaded content')
        },
      }
    }

    const parserMocks: Record<string, string> = {
      './google-doc': 'google-doc',
      './google-sheet': 'google-sheet',
      './pdf': 'pdf',
      './plain-text': 'plain-text',
      './word': 'word',
      './excel': 'excel',
      './powerpoint': 'powerpoint',
    }

    if (parserMocks[request]) {
      const name = parserMocks[request]
      const exportName = {
        'google-doc': 'parseGoogleDoc',
        'google-sheet': 'parseGoogleSheet',
        pdf: 'parsePDF',
        'plain-text': 'parsePlainText',
        word: 'parseWord',
        excel: 'parseExcel',
        powerpoint: 'parsePowerPoint',
      }[name]!

      return {
        [exportName]: async (...args: unknown[]) => {
          calls.parser.push({ name, args })
          return parsed(name)
        },
      }
    }

    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return {
      module: require('@/lib/file-parsers') as typeof import('@/lib/file-parsers'),
      calls,
    }
  } finally {
    Module._load = originalLoad
  }
}

describe('functional: file parser dispatcher', () => {
  it('exports Google Docs and routes them to the Google Doc parser', async () => {
    const { module, calls } = loadDispatcher()

    const result = await module.parseFile(makeFile('application/vnd.google-apps.document'), 'token')

    assert.equal(result.content, 'parsed by google-doc')
    assert.deepEqual(calls.exportGoogleFile, [
      ['drive-file-1', 'application/vnd.google-apps.document', 'token'],
    ])
    assert.equal(calls.downloadFile.length, 0)
    assert.equal(calls.parser[0].name, 'google-doc')
  })

  it('exports Google Sheets and routes them to the sheet parser', async () => {
    const { module, calls } = loadDispatcher()

    const result = await module.parseFile(makeFile('application/vnd.google-apps.spreadsheet'), 'token')

    assert.equal(result.content, 'parsed by google-sheet')
    assert.deepEqual(calls.exportGoogleFile, [
      ['drive-file-1', 'application/vnd.google-apps.spreadsheet', 'token'],
    ])
    assert.equal(calls.parser[0].name, 'google-sheet')
  })

  it('downloads binary/text files and dispatches by MIME type', async () => {
    const cases = [
      ['application/pdf', 'pdf'],
      ['text/plain', 'plain-text'],
      ['text/markdown', 'plain-text'],
      ['text/csv', 'plain-text'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel'],
      ['application/vnd.ms-excel', 'excel'],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'powerpoint'],
    ] as const

    for (const [mimeType, parserName] of cases) {
      const { module, calls } = loadDispatcher()
      const result = await module.parseFile(makeFile(mimeType), 'token')

      assert.equal(result.content, `parsed by ${parserName}`)
      assert.deepEqual(calls.downloadFile, [['drive-file-1', 'token']])
      assert.equal(calls.exportGoogleFile.length, 0)
      assert.equal(calls.parser[0].name, parserName)
    }
  })

  it('throws a helpful error for legacy application/msword files', async () => {
    const { module } = loadDispatcher()

    await assert.rejects(
      () => module.parseFile(makeFile('application/msword'), 'token'),
      /\.doc is an old Word format/,
    )
  })

  it('throws for unsupported MIME types', async () => {
    const { module } = loadDispatcher()

    await assert.rejects(
      () => module.parseFile(makeFile('application/x-unknown'), 'token'),
      /Unsupported MIME type: application\/x-unknown/,
    )
  })
})
