import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '..')

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(rootDir, relativePath))
}

describe('smoke: project shape', () => {
  it('has the main app entry points and API routes', () => {
    for (const file of [
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/api/auth/[...nextauth]/route.ts',
      'src/app/api/folders/route.ts',
      'src/app/api/folders/[folderId]/route.ts',
      'src/app/api/folders/[folderId]/ingest/route.ts',
      'src/app/api/folders/[folderId]/status/route.ts',
      'src/app/api/folders/[folderId]/files/route.ts',
      'src/app/api/chat/route.ts',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('has the service and parser layers described by the README', () => {
    for (const file of [
      'src/services/folder-service.ts',
      'src/services/ingestion-service.ts',
      'src/services/chat-service.ts',
      'src/lib/file-parsers/index.ts',
      'src/lib/file-parsers/google-doc.ts',
      'src/lib/file-parsers/google-sheet.ts',
      'src/lib/file-parsers/pdf.ts',
      'src/lib/file-parsers/word.ts',
      'src/lib/file-parsers/excel.ts',
      'src/lib/file-parsers/powerpoint.ts',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('exposes category-specific test scripts', () => {
    const pkg = require('../package.json')

    assert.equal(pkg.scripts.test, 'node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:unit'], 'TEST_KIND=unit node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:functional'], 'TEST_KIND=functional node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:smoke'], 'TEST_KIND=smoke node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:blackbox'], 'TEST_KIND=blackbox node --test tests/run.cjs')
  })
})
