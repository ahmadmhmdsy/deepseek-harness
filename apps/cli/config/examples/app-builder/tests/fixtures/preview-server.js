#!/usr/bin/env node
// Tiny static-server fixture used by the keyless smoke. Listens on the
// $PORT the preview tool exports, serves one HTML page that proves the
// readiness probe reached it, and keeps running until SIGTERM.

import { createServer } from 'node:http'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const host = '127.0.0.1'
const body = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="UTF-8"><title>App Builder keyless smoke</title></head>',
  '<body><main><h1>APP_BUILDER_PREVIEW_READY</h1></main></body>',
  '</html>',
].join('\n')

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
})

server.listen(port, host, () => {
  process.stdout.write(`preview-server ready on http://${host}:${port}\n`)
})

const shutdown = () => { server.close(() => process.exit(0)) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
