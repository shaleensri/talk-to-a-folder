import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const Module = require('module')

// ---------------------------------------------------------------------------
// Word parser (mammoth — top-level import, can be mocked via Module._load)
// ---------------------------------------------------------------------------

function loadWordParser(options: { rawText?: string } = {}) {
  const originalLoad = Module._load
  const modulePath = require.resolve('@/lib/file-parsers/word')
  delete require.cache[modulePath]

  Module._load = function mockLoad(request: string) {
    if (request === 'mammoth') {
      // mammoth is a default import; return object that becomes { default: ... }
      return { extractRawText: async () => ({ value: options.rawText ?? 'Extracted text.' }) }
    }
    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean])
  }

  try {
    return require('@/lib/file-parsers/word') as typeof import('@/lib/file-parsers/word')
  } finally {
    Module._load = originalLoad
  }
}

describe('parseWord', () => {
  it('returns the correct fileId, fileName, and mimeType', async () => {
    const { parseWord } = loadWordParser()

    const result = await parseWord(Buffer.from(''), 'file-w1', 'Contract.docx')

    assert.equal(result.fileId, 'file-w1')
    assert.equal(result.fileName, 'Contract.docx')
    assert.equal(
      result.mimeType,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('returns the raw text extracted by mammoth', async () => {
    const { parseWord } = loadWordParser({ rawText: 'Section 1\n\nSection 2' })

    const result = await parseWord(Buffer.from(''), 'file-w1', 'Doc.docx')

    assert.equal(result.content, 'Section 1\n\nSection 2')
  })

  it('trims whitespace from the extracted content', async () => {
    const { parseWord } = loadWordParser({ rawText: '  \n\n  Trimmed content.  \n  ' })

    const result = await parseWord(Buffer.from(''), 'file-w1', 'Doc.docx')

    assert.equal(result.content, 'Trimmed content.')
  })

  it('returns empty string when mammoth extracts no text', async () => {
    const { parseWord } = loadWordParser({ rawText: '' })

    const result = await parseWord(Buffer.from(''), 'file-w1', 'Empty.docx')

    assert.equal(result.content, '')
  })
})

// ---------------------------------------------------------------------------
// PDF parser (pdf-parse — dynamic import, mock via require.cache)
// ---------------------------------------------------------------------------

describe('parsePDF', () => {
  function withPdfParseMock(
    mockResult: { text: string; numpages: number; info?: object },
    fn: () => Promise<void>,
  ) {
    // pdf-parse is dynamically imported inside parsePDF.
    // We inject a mock into require.cache so the dynamic require() picks it up.
    const pdfParsePath = require.resolve('pdf-parse')
    const original = require.cache[pdfParsePath]

    // pdf-parse exports a function as module.exports (not esModule).
    // TypeScript's __importDefault wraps it as { default: fn }, so the code
    // receives the mock via `(await import('pdf-parse')).default`.
    const mockFn = async (_buf: Buffer) => mockResult
    ;(require.cache as Record<string, unknown>)[pdfParsePath] = {
      id: pdfParsePath,
      filename: pdfParsePath,
      loaded: true,
      exports: mockFn,
      parent: null,
      children: [],
      paths: [],
    }

    return fn().finally(() => {
      if (original) {
        require.cache[pdfParsePath] = original
      } else {
        delete require.cache[pdfParsePath]
      }
    })
  }

  it('returns the correct fileId, fileName, and mimeType', async () => {
    await withPdfParseMock({ text: 'PDF content.', numpages: 2 }, async () => {
      // Fresh load so the module captures the mocked pdf-parse
      delete require.cache[require.resolve('@/lib/file-parsers/pdf')]
      const { parsePDF } = require('@/lib/file-parsers/pdf') as typeof import('@/lib/file-parsers/pdf')

      const result = await parsePDF(Buffer.from('%PDF'), 'file-p1', 'Slides.pdf')

      assert.equal(result.fileId, 'file-p1')
      assert.equal(result.fileName, 'Slides.pdf')
      assert.equal(result.mimeType, 'application/pdf')
    })
  })

  it('normalises excessive blank lines in the extracted text', async () => {
    await withPdfParseMock({ text: 'Page 1\r\n\r\n\r\n\r\nPage 2', numpages: 1 }, async () => {
      delete require.cache[require.resolve('@/lib/file-parsers/pdf')]
      const { parsePDF } = require('@/lib/file-parsers/pdf') as typeof import('@/lib/file-parsers/pdf')

      const result = await parsePDF(Buffer.from('%PDF'), 'file-p1', 'Doc.pdf')

      // Three or more newlines collapsed to exactly two
      assert.equal(result.content, 'Page 1\n\nPage 2')
    })
  })

  it('includes pageCount in metadata', async () => {
    await withPdfParseMock({ text: 'Content', numpages: 7 }, async () => {
      delete require.cache[require.resolve('@/lib/file-parsers/pdf')]
      const { parsePDF } = require('@/lib/file-parsers/pdf') as typeof import('@/lib/file-parsers/pdf')

      const result = await parsePDF(Buffer.from('%PDF'), 'file-p1', 'Big.pdf')

      assert.equal((result.metadata as { pageCount: number })?.pageCount, 7)
    })
  })
})

// ---------------------------------------------------------------------------
// PowerPoint parser (officeparser — dynamic import, mock via require.cache)
// ---------------------------------------------------------------------------

describe('parsePowerPoint', () => {
  function withOfficeparserMock(textResult: string, fn: () => Promise<void>) {
    const officeparserPath = require.resolve('officeparser')
    const original = require.cache[officeparserPath]

    // officeparser named export: { parseOffice }
    // parsePowerPoint does: const { parseOffice } = await import('officeparser')
    ;(require.cache as Record<string, unknown>)[officeparserPath] = {
      id: officeparserPath,
      filename: officeparserPath,
      loaded: true,
      exports: {
        parseOffice: async (_buf: Buffer) => ({
          toText: () => textResult,
        }),
      },
      parent: null,
      children: [],
      paths: [],
    }

    return fn().finally(() => {
      if (original) {
        require.cache[officeparserPath] = original
      } else {
        delete require.cache[officeparserPath]
      }
    })
  }

  it('returns the correct fileId, fileName, and mimeType', async () => {
    await withOfficeparserMock('Slide content.', async () => {
      delete require.cache[require.resolve('@/lib/file-parsers/powerpoint')]
      const { parsePowerPoint } =
        require('@/lib/file-parsers/powerpoint') as typeof import('@/lib/file-parsers/powerpoint')
      const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

      const result = await parsePowerPoint(Buffer.from(''), 'file-pp1', 'Deck.pptx', mimeType)

      assert.equal(result.fileId, 'file-pp1')
      assert.equal(result.fileName, 'Deck.pptx')
      assert.equal(result.mimeType, mimeType)
    })
  })

  it('extracts text via toText() from the parsed AST', async () => {
    await withOfficeparserMock('Slide 1 text\nSlide 2 text', async () => {
      delete require.cache[require.resolve('@/lib/file-parsers/powerpoint')]
      const { parsePowerPoint } =
        require('@/lib/file-parsers/powerpoint') as typeof import('@/lib/file-parsers/powerpoint')
      const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

      const result = await parsePowerPoint(Buffer.from(''), 'file-pp1', 'Deck.pptx', mimeType)

      assert.equal(result.content, 'Slide 1 text\nSlide 2 text')
    })
  })

  it('trims whitespace from the extracted content', async () => {
    await withOfficeparserMock('  \n  Trimmed slide.  \n  ', async () => {
      delete require.cache[require.resolve('@/lib/file-parsers/powerpoint')]
      const { parsePowerPoint } =
        require('@/lib/file-parsers/powerpoint') as typeof import('@/lib/file-parsers/powerpoint')
      const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

      const result = await parsePowerPoint(Buffer.from(''), 'file-pp1', 'Deck.pptx', mimeType)

      assert.equal(result.content, 'Trimmed slide.')
    })
  })
})
