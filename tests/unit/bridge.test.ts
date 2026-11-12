import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessBridge, exchangeLaunchToken } from '../../src/main/bridge.js'

let upstream: Server
let wss: WebSocketServer
let bridge: HarnessBridge | undefined
let upstreamOrigin: string
let dir: string
const cookie = 'dsh-auth-test=upstream-secret'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dshf-bridge-'))
  upstream = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/launch') { res.writeHead(303, { location: '/', 'set-cookie': `${cookie}; Path=/; HttpOnly; SameSite=Strict` }); res.end(); return }
    if (url.pathname === '/bad-launch') { res.writeHead(200, { 'set-cookie': 'insecure=1' }); res.end('no'); return }
    if (url.pathname === '/html') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'upstream=secret' }); res.end('<html><head></head><body>Harness</body></html>'); return }
    if (url.pathname === '/redirect') { res.writeHead(302, { location: '/html' }); res.end(); return }
    if (url.pathname === '/external-redirect') { res.writeHead(302, { location: 'https://evil.example' }); res.end(); return }
    if (url.pathname === '/stream') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: uno\n\n'); setTimeout(() => { res.write('data: dos\n\n'); res.end() }, 20); return }
    if (url.pathname === '/echo') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ method: req.method, cookie: req.headers.cookie, origin: req.headers.origin, host: req.headers.host })); return }
    res.writeHead(404); res.end('no existe')
  })
  wss = new WebSocketServer({ server: upstream, path: '/connect' })
  wss.on('connection', socket => { socket.on('message', data => socket.send(`eco:${data}`)) })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  upstreamOrigin = `http://127.0.0.1:${(upstream.address() as import('node:net').AddressInfo).port}`
})
afterEach(async () => {
  await bridge?.close(); bridge = undefined
  for (const client of wss.clients) client.terminate()
  await new Promise<void>(resolve => wss.close(() => resolve()))
  await new Promise<void>(resolve => upstream.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

async function start(options: Partial<ConstructorParameters<typeof HarnessBridge>[0]> = {}) {
  bridge = new HarnessBridge({ upstream: upstreamOrigin, cookie, appOrigins: ['dshf://app'], themeCss: 'body{color:red}', ...options })
  await bridge.listen()
  return bridge
}
async function bootstrap(value = bridge!.bootstrapUrl()) {
  const response = await fetch(value, { redirect: 'manual' })
  await response.body?.cancel()
  expect(response.status).toBe(303)
  const session = response.headers.get('set-cookie')!.split(';', 1)[0]!
  return session
}

describe('HarnessBridge', () => {
  it('rejects non-loopback upstreams', () => {
    expect(() => new HarnessBridge({ upstream: 'https://evil.example', cookie, appOrigins: [], themeCss: '' })).toThrow()
  })
  it('exchanges launch tokens only for secure HttpOnly SameSite cookies', async () => {
    expect(await exchangeLaunchToken(new URL('/launch', upstreamOrigin))).toBe(cookie)
    await expect(exchangeLaunchToken(new URL('/bad-launch', upstreamOrigin))).rejects.toThrow('sesión segura')
  })
  it('issues one-use expiring bootstrap tickets and rotates unused ones', async () => {
    const owned = await start()
    const first = owned.bootstrapUrl()
    const second = owned.bootstrapUrl()
    expect(second).not.toBe(first)
    const old = await fetch(first, { redirect: 'manual' }); expect(old.status).toBe(403); await old.body?.cancel()
    const session = await bootstrap(second)
    const replay = await fetch(second, { redirect: 'manual' }); expect(replay.status).toBe(403); await replay.body?.cancel()
    const health = await fetch(new URL('/__dshf/health', owned.origin))
    expect(await health.json()).toEqual({ ok: true })
    expect(session).toContain('dshf_bridge=')
  })
  it('expires tickets', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const owned = await start()
      const url = owned.bootstrapUrl()
      vi.setSystemTime(Date.now() + 61_000)
      const response = await fetch(url, { redirect: 'manual' })
      expect(response.status).toBe(403)
      await response.body?.cancel()
    } finally { vi.useRealTimers() }
  })
  it('fences hosts, origins, cross-site subresources and unauthenticated requests', async () => {
    const owned = await start()
    const session = await bootstrap()
    expect((await fetch(owned.origin, { headers: { host: 'evil.example' } })).status).toBe(403)
    expect((await fetch(new URL('/html', owned.origin))).status).toBe(403)
    expect((await fetch(new URL('/html', owned.origin), { headers: { cookie: session, origin: 'https://evil.example' } })).status).toBe(403)
    expect((await fetch(new URL('/html', owned.origin), { headers: { cookie: session, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script' } })).status).toBe(403)
    expect((await fetch(new URL('/echo', owned.origin), { method: 'POST', headers: { cookie: session } })).status).toBe(403)
  })
  it('injects only presentation CSS, hides upstream cookies and pins frame ancestors', async () => {
    const owned = await start()
    const session = await bootstrap()
    const response = await fetch(new URL('/html', owned.origin), { headers: { cookie: session, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('content-security-policy')).toBe('frame-ancestors dshf://app')
    const html = await response.text()
    expect(html).toContain('/__dshf/harness.css')
    expect(html).toContain('<body>Harness</body>')
    const css = await fetch(new URL('/__dshf/harness.css', owned.origin), { headers: { cookie: session } })
    expect(await css.text()).toBe('body{color:red}')
  })
  it('serves only bundled fonts to authenticated sessions', async () => {
    await writeFile(join(dir, 'inter-latin-wght-normal.woff2'), Buffer.alloc(2048, 7))
    const owned = await start({ fontRoot: dir })
    const session = await bootstrap()
    const font = await fetch(new URL('/__dshf/fonts/inter-latin-wght-normal.woff2', owned.origin), { headers: { cookie: session } })
    expect(font.status).toBe(200)
    expect(font.headers.get('content-type')).toBe('font/woff2')
    expect((await font.arrayBuffer()).byteLength).toBe(2048)
    const missing = await fetch(new URL('/__dshf/fonts/inter-latin-ext-wght-normal.woff2', owned.origin), { headers: { cookie: session } })
    expect(missing.status).toBe(404); await missing.body?.cancel()
    const traversal = await fetch(new URL('/__dshf/fonts/..%2Fpackage.json', owned.origin), { headers: { cookie: session } })
    expect(traversal.status).toBe(404); await traversal.body?.cancel()
    const denied = await fetch(new URL('/__dshf/fonts/inter-latin-wght-normal.woff2', owned.origin))
    expect(denied.status).toBe(403); await denied.body?.cancel()
  })
  it('can disable decoration and prepends a link when head is absent', async () => {
    const owned = await start({ decorateHtml: false })
    const session = await bootstrap()
    const html = await (await fetch(new URL('/html', owned.origin), { headers: { cookie: session } })).text()
    expect(html).not.toContain('harness.css')
  })
  it('proxies authenticated JSON mutations and rewrites only local redirects', async () => {
    const owned = await start()
    const session = await bootstrap()
    const response = await fetch(new URL('/echo', owned.origin), { method: 'POST', headers: { cookie: session, origin: owned.origin, 'content-type': 'application/json' }, body: '{"x":1}' })
    expect(await response.json()).toEqual({ method: 'POST', cookie, origin: upstreamOrigin, host: new URL(upstreamOrigin).host })
    const redirect = await fetch(new URL('/redirect', owned.origin), { headers: { cookie: session }, redirect: 'manual' })
    expect(redirect.headers.get('location')).toBe('/html')
    await redirect.body?.cancel()
    const external = await fetch(new URL('/external-redirect', owned.origin), { headers: { cookie: session }, redirect: 'manual' })
    expect(external.headers.get('location')).toBeNull()
    await external.body?.cancel()
  })
  it('streams SSE responses and handles HEAD', async () => {
    const owned = await start()
    const session = await bootstrap()
    const response = await fetch(new URL('/stream', owned.origin), { headers: { cookie: session } })
    expect(await response.text()).toBe('data: uno\n\ndata: dos\n\n')
    const head = await fetch(new URL('/html', owned.origin), { method: 'HEAD', headers: { cookie: session } })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })
  it('proxies WebSocket upgrades with the upstream cookie and rejects unauthorized upgrades', async () => {
    const owned = await start()
    const session = await bootstrap()
    const socket = new WebSocket(new URL('/connect', owned.origin).href.replace('http:', 'ws:'), { headers: { cookie: session, origin: owned.origin } })
    const message = await new Promise<string>((resolve, reject) => {
      socket.on('open', () => socket.send('hola'))
      socket.on('message', data => resolve(data.toString()))
      socket.on('error', reject)
    })
    expect(message).toBe('eco:hola')
    socket.close()
    const denied = new WebSocket(new URL('/connect', owned.origin).href.replace('http:', 'ws:'))
    await new Promise<void>(resolve => { denied.on('error', () => resolve()); denied.on('unexpected-response', () => resolve()) })
    denied.terminate()
  })
  it('returns 502 when the upstream disappears and closes idempotently', async () => {
    const owned = await start()
    const session = await bootstrap()
    await new Promise<void>(resolve => upstream.close(() => resolve()))
    const response = await fetch(new URL('/html', owned.origin), { headers: { cookie: session } })
    expect(response.status).toBe(502)
    await owned.close()
    await owned.close()
    expect(() => owned.bootstrapUrl()).toThrow()
  })
})
