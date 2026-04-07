const fs = require('node:fs')
const path = require('node:path')

/**
 * Work around environments where Node.js async child process spawning fails with EPERM.
 *
 * Vite calls `exec("net use", ...)` on Windows to detect mapped network drives and
 * pick a safe `realpathSync` implementation. If `exec` throws (e.g. spawn EPERM),
 * Vite crashes while loading config.
 *
 * This patch wraps that `exec` call in a try/catch and falls back gracefully.
 */
function main() {
  if (process.platform !== 'win32') return

  const viteChunkPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'vite',
    'dist',
    'node',
    'chunks',
    'node.js',
  )

  if (!fs.existsSync(viteChunkPath)) return

  const before = fs.readFileSync(viteChunkPath, 'utf8')
  if (before.includes('\ttry {\n\t\texec("net use",')) return

  const anchor = '\texec("net use", (error$1, stdout) => {'
  const startIndex = before.indexOf(anchor)
  if (startIndex === -1) {
    console.warn('[patch-vite] target pattern not found; skipping')
    return
  }

  const closeMarker = '\t});\n}'
  const closeMarkerIndex = before.indexOf(closeMarker, startIndex)
  if (closeMarkerIndex === -1) {
    console.warn('[patch-vite] end marker not found; skipping')
    return
  }

  const execCallEndIndex = closeMarkerIndex + '\t});'.length

  const patched =
    before.slice(0, startIndex) +
    '\ttry {\n' +
    before.slice(startIndex, execCallEndIndex) +
    '\n\t} catch (e$1) {\n\t\tsafeRealpathSync = fs.realpathSync.native;\n\t}\n' +
    before.slice(execCallEndIndex)

  fs.writeFileSync(viteChunkPath, patched, 'utf8')
  console.log('[patch-vite] applied Windows net-use exec guard')
}

main()
