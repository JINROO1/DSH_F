import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { connect as netConnect, type AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { Duplex } from 'node:stream'
import { readCookie, secretMatches, trustedRequest } from './security.js'
import { redact } from './log.js'

const COOKIE = 'dshf_bridge'
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'set-cookie', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer'])
export interface BridgeOptions {
  upstream: string
  cookie: string
  appOrigins: readonly string[]
  themeCss: string
  /** Inject the presentation-only stylesheet into the owned Harness document. */
  decorateHtml?: boolean
}

/** Loopback-only authenticated bridge. Upstream credentials never enter a renderer or a URL. */
export class HarnessBridge {
  readonly server: Server
  private readonly upstream: URL
  private readonly session = randomBytes(32).toString('base64url')
  private ticket: { value: string; expires: number } | undefined
  private authority = ''
  private closed = false
  private readonly sockets = new Set<Duplex>()
  private readonly requests = new Set<ReturnType<typeof httpRequest>>()
  origin = ''

  constructor(private readonly options: BridgeOptions) {
    this.upstream = new URL(options.upstream)
    if (this.upstream.hostname !== '127.0.0.1' || this.upstream.protocol !== 'http:') throw new Error('El motor debe escuchar en HTTP sobre 127.0.0.1')
    this.server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, (req, res) => {
      void this.handle(req, res).catch(error => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end(`No se pudo conectar con Harness: ${redact(error instanceof Error ? error.message : String(error))}`)
      })
    })
    this.server.on('upgrade', (req, socket, head) => { void this.upgrade(req, socket, head) })
    this.server.on('connection', socket => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
      socket.on('error', () => socket.destroy())
    })
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve() })
    })
    const address = this.server.address() as AddressInfo
    this.authority = `127.0.0.1:${address.port}`
    this.origin = `http://${this.authority}`
  }

  /** Calling again rotates the previous unused ticket. Tickets expire after 60 seconds. */
  bootstrapUrl(): string {
    if (this.closed || !this.origin) throw new Error('El puente no está disponible')
    this.ticket = { value: randomBytes(32).toString('base64url'), expires: Date.now() + 60_000 }
    return `${this.origin}/__dshf/bootstrap?ticket=${this.ticket.value}`
  }

  private hasSession(req: IncomingMessage): boolean {
    return secretMatches(readCookie(req.headers.cookie, COOKIE) ?? '', this.session)
  }

  private fence(req: IncomingMessage, res: ServerResponse): boolean {
    if (!trustedRequest(req, this.authority, this.options.appOrigins, this.hasSession(req))) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Acceso restringido a la ventana de DeepSeek Harness Fedora.')
      return false
    }
    return true
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.origin || 'http://127.0.0.1')
    if (req.headers.host !== this.authority) { res.writeHead(403); res.end('Host no permitido'); return }
    if (url.pathname === '/__dshf/bootstrap') {
      const ticket = this.ticket
      if (req.method !== 'GET' || !ticket || ticket.expires < Date.now() || !secretMatches(url.searchParams.get('ticket') ?? '', ticket.value)) {
        res.writeHead(403, { 'cache-control': 'no-store' }); res.end('Enlace de sesión caducado'); return
      }
      this.ticket = undefined
      res.writeHead(303, {
        location: '/', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
        // The shell is dshf://app while Harness is loopback HTTP: cross-site but
        // loopback is a trustworthy origin, so Secure cookies are accepted.
        'set-cookie': `${COOKIE}=${this.session}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`,
      })
      res.end(); return
    }
    if (url.pathname === '/__dshf/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: !this.closed })); return
    }
    if (!this.fence(req, res)) return
    if (url.pathname === '/__dshf/harness.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : this.options.themeCss); return
    }
    const target = new URL(url.pathname + url.search, this.upstream)
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_HEADERS.has(name) || ['host', 'origin', 'cookie', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'].includes(name)) continue
      headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }
    headers.set('host', this.upstream.host)
    headers.set('origin', this.upstream.origin)
    headers.set('cookie', this.options.cookie)
    const abort = new AbortController()
    res.once('close', () => { if (!res.writableEnded) abort.abort() })
    const method = req.method ?? 'GET'
    const response = await fetch(target, {
      method, headers, redirect: 'manual', signal: abort.signal,
      ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
    } as RequestInit)
    const outgoing = new Headers()
    response.headers.forEach((value, name) => { if (!HOP_HEADERS.has(name)) outgoing.set(name, value) })
    outgoing.set('cache-control', 'no-store')
    outgoing.set('referrer-policy', 'no-referrer')
    outgoing.set('content-security-policy', `frame-ancestors ${this.options.appOrigins.join(' ') || "'none'"}`)
    const location = response.headers.get('location')
    outgoing.delete('location')
    if (location) {
      try { const redirect = new URL(location, target); if (redirect.origin === this.upstream.origin) outgoing.set('location', redirect.pathname + redirect.search + redirect.hash) } catch { /* Malformed redirects are stripped. */ }
    }
    const html = this.options.decorateHtml !== false && response.headers.get('content-type')?.includes('text/html')
    if (html) {
      const body = await response.text()
      const link = '<link rel="stylesheet" href="/__dshf/harness.css">'
      const decorated = body.includes('</head>') ? body.replace('</head>', `${link}</head>`) : link + body
      outgoing.delete('content-length')
      res.writeHead(response.status, Object.fromEntries(outgoing))
      res.end(req.method === 'HEAD' ? undefined : decorated)
      return
    }
    res.writeHead(response.status, Object.fromEntries(outgoing))
    if (!response.body || req.method === 'HEAD') { res.end(); return }
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res)
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    socket.on('error', () => socket.destroy())
    if (!trustedRequest(req, this.authority, this.options.appOrigins, this.hasSession(req))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    const target = new URL(req.url ?? '/', this.upstream)
    target.protocol = 'ws:'
    const upstream = httpRequest({
      hostname: this.upstream.hostname, port: this.upstream.port, path: target.pathname + target.search,
      method: 'GET', headers: { ...req.headers, host: this.upstream.host, origin: this.upstream.origin, cookie: this.options.cookie },
    })
    this.requests.add(upstream)
    upstream.on('upgrade', (response, upstreamSocket, upgradeHead) => {
      this.requests.delete(upstream)
      this.sockets.add(upstreamSocket)
      upstreamSocket.on('close', () => this.sockets.delete(upstreamSocket))
      upstreamSocket.on('error', () => { upstreamSocket.destroy(); socket.destroy() })
      socket.on('close', () => upstreamSocket.destroy())
      const headers = [`HTTP/1.1 101 Switching Protocols`, 'Upgrade: websocket', 'Connection: Upgrade']
      for (const [name, value] of Object.entries(response.headers)) {
        if (!HOP_HEADERS.has(name) && value !== undefined) headers.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
      }
      socket.write(headers.join('\r\n') + '\r\n\r\n')
      if (upgradeHead.length) socket.write(upgradeHead)
      if (head.length) upstreamSocket.write(head)
      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)
    })
    upstream.on('response', response => { this.requests.delete(upstream); socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Upgrade rejected\r\nConnection: close\r\n\r\n`) })
    upstream.on('error', () => { this.requests.delete(upstream); socket.destroy() })
    upstream.end()
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.ticket = undefined
    for (const request of this.requests) request.destroy()
    for (const socket of this.sockets) socket.destroy()
    this.server.closeAllConnections()
    if (this.server.listening) await new Promise<void>(resolve => this.server.close(() => resolve()))
  }
}

/** Exchange the launch capability for an HttpOnly cookie without following redirects. */
export async function exchangeLaunchToken(url: URL): Promise<string> {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  const cookie = response.headers.get('set-cookie')
  await response.body?.cancel()
  if (response.status !== 303 || !cookie || !/HttpOnly/i.test(cookie) || !/SameSite=Strict/i.test(cookie)) throw new Error('El motor no entregó una sesión segura')
  return cookie.split(';', 1)[0]!
}
