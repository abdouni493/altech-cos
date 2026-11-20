// ============================================================================
// Altech POS — offline server
//
// Serves the built app (`dist/`) and the local database API on this PC.
// No internet connection and no external database are needed.
//
//   node server/server.mjs            → http://localhost:5175
//   PORT=8080 node server/server.mjs  → another port
//   ALTECH_DATA_DIR=D:\pos-data       → keep the database somewhere else
// ============================================================================

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApi, lanAddresses } from './api.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const DATA_DIR = path.resolve(process.env.ALTECH_DATA_DIR || path.join(ROOT, 'data'))
const PORT = Number(process.env.PORT) || 5175

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('\n  [Altech POS] The app is not built yet — run "npm run build" (run-app.bat does it for you).\n')
  process.exit(1)
}

const { handle, db } = createApi({ dataDir: DATA_DIR })

const serveFile = (res, file, immutable) => {
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const handled = await handle(req, res, () => false)
  if (handled !== false) return

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return res.end()
  }

  let pathname = '/'
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.statusCode = 400
    return res.end()
  }

  // Never serve anything outside dist/.
  const file = path.normalize(path.join(DIST, pathname))
  if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return serveFile(res, file, pathname.startsWith('/assets/'))
  }
  // Single-page app: every other route is rendered by index.html.
  return serveFile(res, path.join(DIST, 'index.html'), false)
})

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`)
      const body = await r.json()
      if (body?.app === 'altech-pos') {
        console.log(`\n  [Altech POS] Already running on http://localhost:${PORT}\n`)
        db.close()
        process.exit(0)
      }
    } catch {
      /* the port belongs to another program */
    }
    console.error(`\n  [Altech POS] Port ${PORT} is used by another program. Close it or set PORT=<number>.\n`)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Altech POS — offline server')
  console.log(`  App       : http://localhost:${PORT}`)
  for (const ip of lanAddresses()) console.log(`  Network   : http://${ip}:${PORT}  (phone scanner)`)
  console.log(`  Database  : ${DATA_DIR}`)
  console.log('\n  Keep this window open while you use the app. Close it to stop the server.\n')
})

const shutdown = () => {
  db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGHUP', shutdown)
