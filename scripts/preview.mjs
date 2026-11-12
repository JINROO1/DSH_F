import { createServer } from 'node:http'
import { connect as netConnect } from 'node:net'
import { readFile, mkdir, writeFile, realpath, stat } from 'node:fs/promises'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { HarnessRuntime, DesktopStore, DiagnosticLog, collectDiagnostics, diagnosticsText, commandSchema, APP_ORIGIN, errorMessage } from '../dist/preview-core.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const portIndex = process.argv.indexOf('--port')
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto no válido')
const preview = join(root, '.preview')
const workspaces = join(preview, 'workspaces')
const demo = join(workspaces, 'proyecto-demo')
await mkdir(demo, { recursive: true })
await writeFile(join(demo, 'README.md'), '# Proyecto de demostración\n\nCarpeta local segura para explorar la integración de DeepSeek Harness Fedora.\n')
const log = new DiagnosticLog(join(preview, 'logs/desktop.log'))
const store = new DesktopStore(join(preview, 'desktop.json'))
const state = await store.load()
const runtime = new HarnessRuntime({ runtimeRoot: join(root, 'runtime'), home: join(preview, 'harness'), userData: preview, appOrigins: [APP_ORIGIN], log, autoRestart: false, startupTimeoutMs: 120_000 }, state.settings)
const clients = new Set()
const sockets = new Set()
function safeStatus(status = runtime.status()) {
  const { bridgeUrl, ...safe } = status
  if (status.phase === 'ready' && bridgeUrl) return { ...safe, bridgeUrl: `/__engine/bootstrap?ticket=${new URL(bridgeUrl).searchParams.get('ticket')}` }
  return safe
}
function broadcast(status) {
  const { bridgeUrl: _secret, ...safe } = status
  const data = `data: ${JSON.stringify(safe)}\n\n`
  for (const client of clients) client.write(data)
}
runtime.on('status', broadcast)

async function command(input) {
  const command = commandSchema.parse(input)
  switch (command.channel) {
    case 'state:get': return store.snapshot()
    case 'engine:status': return safeStatus()
    case 'settings:set': { const next = await store.updateSettings(command.payload); await runtime.applySettings(next.settings); return next }
    case 'workspace:choose': return null
    case 'workspace:open': {
      const canonical = await realpath(command.payload.path)
      const rel = relative(workspaces, canonical)
      if (rel.startsWith('..') || rel === '' || resolve(rel) === rel || !(await stat(canonical)).isDirectory()) throw new Error('La vista previa solo admite carpetas dentro de .preview/workspaces')
      await runtime.createWorkspace(canonical)
      return store.rememberWorkspace(canonical)
    }
    case 'workspace:forget': return store.forgetWorkspace(command.payload.path)
    case 'engine:restart': await runtime.restart(); return safeStatus()
    case 'engine:stop': await runtime.stop(); return safeStatus()
    case 'diagnostics:get': return collectDiagnostics({ appVersion: '0.1.0-preview', engine: safeStatus(), logPath: join(preview, 'logs/desktop.log') })
    case 'diagnostics:export': return diagnosticsText(await command({ channel: 'diagnostics:get' }))
    case 'external:open': case 'window:action': return null
  }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://preview')
    if (url.pathname === '/__desktop/health') {
      const phase = runtime.status().phase
      const ok = phase === 'ready'
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok, preview: true, phase }))
      return
    }
    if (url.pathname === '/__desktop/export') {
      const text = diagnosticsText(await command({ channel: 'diagnostics:get' }))
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="dsh-fedora-diagnostico.txt"', 'cache-control': 'no-store' })
      res.end(text); return
    }
    if (url.pathname === '/__desktop/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      const { bridgeUrl: _secret, ...safe } = runtime.status()
      res.write(`data: ${JSON.stringify(safe)}\n\n`)
      clients.add(res)
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000)
      res.on('close', () => { clearInterval(heartbeat); clients.delete(res) })
      return
    }
    if (url.pathname === '/__desktop/command') {
      if (req.method !== 'POST' || req.headers.origin !== undefined && new URL(req.headers.origin).host !== req.headers.host) { res.writeHead(403); res.end('Forbidden'); return }
      let body = ''
      for await (const chunk of req) { body += chunk; if (body.length > 65_536) { res.writeHead(413); res.end(); return } }
      try { const value = await command(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ value: value ?? null })) } catch (error) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: errorMessage(error) })) }
      return
    }
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/__shell/')) {
      const staticRoot = join(root, 'dist/renderer')
      const path = url.pathname === '/' || url.pathname === '/index.html' ? join(staticRoot, 'index.html') : join(staticRoot, decodeURIComponent(url.pathname.slice('/__shell/'.length)))
      if (!path.startsWith(staticRoot + '/')) { res.writeHead(403); res.end(); return }
      let body = await readFile(path)
      const headers = { 'content-type': MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream', 'cache-control': 'no-cache' }
      if (path.endsWith('.html')) {
        body = Buffer.from(body.toString().replace('<head>', '<head><base href="/__shell/">').replace('<script src="./app.js"></script>', '<script src="./preview-adapter.js"></script><script src="./app.js"></script>'))
        headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'self'; object-src 'none'"
      }
      res.writeHead(200, headers); res.end(body); return
    }
    const bridgeOrigin = runtime.bridgeOrigin
    if (!bridgeOrigin) { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); res.end('El motor de la vista previa todavía no está listo.'); return }
    let pathname = url.pathname
    if (pathname === '/__engine/bootstrap') pathname = '/__dshf/bootstrap'
    else if (pathname === '/__engine' || pathname === '/__engine/') pathname = '/'
    else if (pathname.startsWith('/__engine/')) pathname = pathname.slice('/__engine'.length)
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) if (value !== undefined && !['host', 'origin', 'connection', 'content-length', 'transfer-encoding'].includes(name)) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    headers.set('host', new URL(bridgeOrigin).host)
    headers.set('origin', bridgeOrigin)
    const method = req.method ?? 'GET'
    const response = await fetch(new URL(pathname + url.search, bridgeOrigin), { method, headers, redirect: 'manual', ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) })
    const outgoing = new Headers()
    response.headers.forEach((value, name) => { if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(name)) outgoing.set(name, value) })
    const location = response.headers.get('location')
    if (location?.startsWith('/') && !location.startsWith('//')) outgoing.set('location', `/__engine${location}`)
    outgoing.set('content-security-policy', "frame-ancestors 'self'")
    res.writeHead(response.status, Object.fromEntries(outgoing))
    if (!response.body || method === 'HEAD') { res.end(); return }
    await pipeline(Readable.fromWeb(response.body), res)
  } catch (error) {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`Vista previa: ${errorMessage(error)}`)
  }
})
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy())
  const bridgeOrigin = runtime.bridgeOrigin
  if (!bridgeOrigin || !req.url?.startsWith('/connect')) { socket.destroy(); return }
  const upstream = netConnect(Number(new URL(bridgeOrigin).port), '127.0.0.1', () => {
    const headers = [`GET ${req.url} HTTP/1.1`, `Host: ${new URL(bridgeOrigin).host}`, `Origin: ${bridgeOrigin}`]
    for (const [name, value] of Object.entries(req.headers)) if (!['host', 'origin'].includes(name) && value !== undefined) headers.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
    upstream.write(headers.join('\r\n') + '\r\n\r\n')
    if (head.length) upstream.write(head)
    upstream.pipe(socket); socket.pipe(upstream)
  })
  sockets.add(socket); sockets.add(upstream)
  socket.on('close', () => { sockets.delete(socket); upstream.destroy() })
  upstream.on('close', () => { sockets.delete(upstream); socket.destroy() })
  upstream.on('error', () => socket.destroy())
})
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolveListen) })
console.log(`Vista previa aislada en http://0.0.0.0:${port} — no introduzcas credenciales sensibles.`)
void runtime.start().catch(error => console.error('Motor de vista previa:', errorMessage(error)))
let closing = false
async function close() {
  if (closing) return; closing = true
  for (const client of clients) client.end()
  for (const socket of sockets) socket.destroy()
  server.closeAllConnections()
  const force = setTimeout(() => process.exit(1), 15_000)
  force.unref()
  await Promise.all([
    new Promise(resolveClose => server.close(resolveClose)),
    runtime.dispose(),
  ])
  clearTimeout(force)
  process.exit(0)
}
process.once('SIGTERM', () => { void close() })
process.once('SIGINT', () => { void close() })
