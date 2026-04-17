require('./register.cjs')

const fs = require('fs')
const path = require('path')

const testDir = __dirname
const kind = process.env.TEST_KIND

function collectTests(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    return a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectTests(fullPath)
      continue
    }

    if (!entry.name.endsWith('.test.ts')) continue
    if (kind && !entry.name.endsWith(`.${kind}.test.ts`)) continue

    require(fullPath)
  }
}

collectTests(testDir)
