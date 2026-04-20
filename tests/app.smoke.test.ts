import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '..')

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(rootDir, relativePath))
}

describe('smoke: project shape', () => {
  it('has the core page routes', () => {
    for (const file of [
      // Landing / about page is now the root
      'src/app/page.tsx',
      // App shell moved to /app route
      'src/app/app/page.tsx',
      'src/app/layout.tsx',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('has all API routes', () => {
    for (const file of [
      'src/app/api/auth/[...nextauth]/route.ts',
      // Folder CRUD + sub-routes
      'src/app/api/folders/route.ts',
      'src/app/api/folders/[folderId]/route.ts',
      'src/app/api/folders/[folderId]/ingest/route.ts',
      'src/app/api/folders/[folderId]/status/route.ts',
      'src/app/api/folders/[folderId]/files/route.ts',
      // Chat
      'src/app/api/chat/route.ts',
      // Drive folder browser (replaces URL paste)
      'src/app/api/drive/folders/route.ts',
      // File preview
      'src/app/api/files/[fileId]/preview/route.ts',
      'src/app/api/files/[fileId]/preview/raw/route.ts',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('has the service and parser layers', () => {
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
      'src/lib/file-parsers/plain-text.ts',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('has the RAG pipeline modules', () => {
    for (const file of [
      'src/lib/retrieval.ts',
      'src/lib/answer-generator.ts',
      'src/lib/chunker.ts',
      'src/lib/embeddings.ts',
      'src/lib/vector-store.ts',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('has the key UI components', () => {
    for (const file of [
      'src/components/layout/AppShell.tsx',
      'src/components/layout/TopBar.tsx',
      'src/components/layout/MainWorkspace.tsx',
      'src/components/layout/FileTreePanel.tsx',
      'src/components/viewer/DocumentViewer.tsx',
      'src/components/viewer/TableViewer.tsx',
      'src/components/viewer/PdfViewer.tsx',
      'src/components/chat/ChatPanel.tsx',
      'src/components/chat/UserMessage.tsx',
      'src/components/folders/AddFolderModal.tsx',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('has the Zustand stores', () => {
    for (const file of [
      'src/store/chat-store.ts',
      'src/store/ui-store.ts',
    ]) {
      assert.equal(exists(file), true, `${file} should exist`)
    }
  })

  it('exposes category-specific test scripts in package.json', () => {
    const pkg = require('../package.json')

    assert.equal(pkg.scripts.test, 'node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:unit'], 'TEST_KIND=unit node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:functional'], 'TEST_KIND=functional node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:smoke'], 'TEST_KIND=smoke node --test tests/run.cjs')
    assert.equal(pkg.scripts['test:blackbox'], 'TEST_KIND=blackbox node --test tests/run.cjs')
  })
})
