import { createServer } from 'node:http'
import { writeFileSync, appendFileSync } from 'node:fs'

const mode = process.env.FAKE_MODE ?? 'normal'
const statePath = process.env.FAKE_STATE
const token = 't'.repeat(43)
const cookie = 'dsh-auth-test=session; Path=/; HttpOnly; SameSite=Strict'
const record = value => { if (statePath) appendFileSync(statePath, JSON.stringify(value) + '\n') }
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/' && url.searchParams.get('token') === token) {
    res.writeHead(303, { location: '/', 'set-cookie': cookie }); res.end(); return
  }
  if (url.pathname === '/' && req.headers.cookie?.includes('dsh-auth-test=session')) {
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><head><title>Fake Harness</title></head><body><h1>Fake Harness</h1></body></html>'); return
  }
  if (url.pathname.startsWith('/api/') && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const envelope = JSON.parse(body)
      record({ method: envelope.method, args: envelope.payload.args, cookie: req.headers.cookie })
      let value = {}
      if (envelope.method === 'workspace/create') value = { workspace: { workspaceId: 'ws-test', path: envelope.payload.args.request.path }, created: true }
      if (envelope.method === 'settings/update') value = { ns: envelope.payload.args.ns, revision: 1, value: envelope.payload.args.patch }
      if (envelope.method === 'test/fail') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: false, error: { code: 'test/rejected', message: 'rechazado' } } }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value } }))
    })
    return
  }
  if (url.pathname === '/redirect') { res.writeHead(302, { location: '/' }); res.end(); return }
  if (url.pathname === '/stream') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: uno\n\n'); setTimeout(() => { res.write('data: dos\n\n'); res.end() }, 30); return }
  res.writeHead(404); res.end('no existe')
})
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port
  if (mode === 'silent') return
  if (mode === 'early-exit') { setTimeout(() => process.exit(7), 20); return }
  if (mode === 'stderr') process.stderr.write('advertencia de prueba\n')
  console.log(`dsh web: http://127.0.0.1:${port}/?token=${token}`)
  if (statePath) writeFileSync(statePath + '.pid', String(process.pid))
  if (mode === 'crash-after-ready') setTimeout(() => process.exit(9), 250)
  if (mode === 'ignore-term') { process.on('SIGTERM', () => record({ ignoredTerm: true })); setInterval(() => {}, 1000) }
})
