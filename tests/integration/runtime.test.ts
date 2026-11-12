import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HarnessRuntime } from '../../src/main/runtime.js'
import { DiagnosticLog } from '../../src/main/log.js'
import { DEFAULT_SETTINGS } from '../../src/shared/contracts.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
let dir: string
let runtime: HarnessRuntime | undefined
let log: DiagnosticLog

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dshf-integration-'))
  log = new DiagnosticLog(join(dir, 'desktop.log'))
})
afterEach(async () => {
  await runtime?.dispose()
  runtime = undefined
  await log.flush()
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

function create() {
  runtime = new HarnessRuntime({
    runtimeRoot: join(root, 'runtime'),
    home: join(dir, 'harness'),
    userData: join(dir, 'user'),
    appOrigins: ['dshf://app'],
    log,
    startupTimeoutMs: 60_000,
    autoRestart: false,
    themeCssPath: join(root, 'src/renderer/harness-theme.css'),
    fontRoot: join(root, 'node_modules/@fontsource-variable/inter/files'),
  }, { ...DEFAULT_SETTINGS, theme: 'dark', language: 'es' })
  return runtime
}

async function bootstrap(engine: HarnessRuntime) {
  const url = engine.status().bridgeUrl!
  const response = await fetch(url, { redirect: 'manual' })
  await response.body?.cancel()
  expect(response.status).toBe(303)
  return { origin: new URL(url).origin, cookie: response.headers.get('set-cookie')!.split(';', 1)[0]! }
}

describe('official DeepSeek Harness runtime integration', () => {
  it('starts the bundled Node engine, synchronizes settings and serves the decorated UI through the bridge', async () => {
    const engine = create()
    await engine.start()
    expect(engine.status().phase).toBe('ready')
    const { origin, cookie } = await bootstrap(engine)
    const html = await fetch(new URL('/', origin), { headers: { cookie, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe' } })
    expect(html.status).toBe(200)
    expect(html.headers.get('content-security-policy')).toContain('frame-ancestors dshf://app')
    const body = await html.text()
    expect(body).toContain('/__dshf/harness.css')
    expect(body.toLowerCase()).toContain('harness')
    const css = await fetch(new URL('/__dshf/harness.css', origin), { headers: { cookie } })
    const themeCss = await css.text()
    expect(themeCss).toContain('--dsw-alias-state-business-primary')
    expect(themeCss).toContain('--dsw-alias-bg-base: #101318')
    const font = await fetch(new URL('/__dshf/fonts/inter-latin-wght-normal.woff2', origin), { headers: { cookie } })
    expect(font.status).toBe(200)
    expect(font.headers.get('content-type')).toBe('font/woff2')
    expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    const traversal = await fetch(new URL('/__dshf/fonts/..%2F..%2Fpackage.json', origin), { headers: { cookie } })
    expect(traversal.status).toBe(404)
    await traversal.body?.cancel()
    const described = await engine.rpc('settings/describe', {}) as { namespaces: Array<{ ns: string; value: Record<string, unknown> }> }
    const locale = described.namespaces.find(entry => entry.ns === 'locale')
    const theme = described.namespaces.find(entry => entry.ns === 'ui-theme')
    // La shell es española; la release cualificada aún no publica locale es.
    expect(locale?.value.preference).toBe('en')
    expect(theme?.value.preference).toBe('dark')
    const text = await log.read()
    expect(text).not.toMatch(/token=[A-Za-z0-9_-]{43}/)
    expect(text).not.toContain('dsh-auth-')
  })

  it('registers a real workspace, creates a session and preserves both across a restart', async () => {
    const engine = create()
    await engine.start()
    const workspacePath = join(dir, 'proyecto-real')
    await mkdir(workspacePath)
    await writeFile(join(workspacePath, 'README.md'), '# Integración DSH_F\n')
    const workspace = await engine.createWorkspace(workspacePath)
    expect(workspace.path).toBe(workspacePath)
    const session = await engine.rpc('session/create', { request: { workspaceId: workspace.workspaceId } }) as { session?: { sessionId?: string }; sessionId?: string }
    const sessionId = session.session?.sessionId ?? session.sessionId
    expect(sessionId).toBeTruthy()
    const listed = await engine.rpc('session/list', { _request: {} }) as { sessions?: Array<{ sessionId?: string }> }
    expect(JSON.stringify(listed)).toContain(sessionId!)
    await engine.restart()
    expect(engine.status().phase).toBe('ready')
    const again = await engine.createWorkspace(workspacePath)
    expect(again.workspaceId).toBe(workspace.workspaceId)
    const after = await engine.rpc('session/list', { _request: {} })
    expect(JSON.stringify(after)).toContain(sessionId!)
    const stored = await readFile(join(dir, 'harness', '.credentials.yaml'), 'utf8')
    expect(stored.length).toBeGreaterThan(0)
    await expect((await import('node:fs/promises')).stat(join(dir, 'harness', '.credentials.yaml')).then(value => value.mode & 0o777)).resolves.toBe(0o600)
  })

  it('stops the owned process group and releases the bridge port', async () => {
    const engine = create()
    await engine.start()
    const { origin } = await bootstrap(engine)
    await engine.stop()
    expect(engine.status().phase).toBe('stopped')
    await expect(fetch(new URL('/__dshf/health', origin), { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
  })
})
