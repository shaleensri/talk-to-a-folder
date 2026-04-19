const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const rootDir = path.resolve(__dirname, '..')
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(
      this,
      path.join(rootDir, 'src', request.slice(2)),
      parent,
      isMain,
      options,
    )
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

require.extensions['.ts'] = function transpileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  })

  module._compile(output.outputText, filename)
}
