import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../../src/main/runtime.js'
import { DiagnosticLog } from '../../src/main/log.js'
import { DEFAULT_SETTINGS } from '../../src/shared/contracts.js'

const fixture = fileURLToPath(new URL('../fixtures/fake-harness.mjs', import.meta.url))
let dir: string
let runtime: HarnessRuntime | undefined
let log: DiagnosticLog
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-runtime-')) })
afterEach(async () => { await runtime?.dispose(); await log?.flush(); runtime = undefined; delete process.env.FAKE_MODE; delete process.env.FAKE_STATE; await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) })

function create(options: Partial<ConstructorParameters<typeof HarnessRuntime>[0]> = {}, settings = DEFAULT_SETTINGS) {
  log = new DiagnosticLog(join(dir, 'desktop.log'))
  runtime = new HarnessRuntime({ runtimeRoot: dir, home: join(dir, 'home'), userData: join(dir, 'user'), appOrigins: ['dshf://app'], log, nodeBinary: process.execPath, cliPath: fixture, startupTimeoutMs: 3000, stopTimeoutMs: 300, autoRestart: false, ...options }, settings)
  return runtime
}

describe('HarnessRuntime lifecycle', () => {
  it('starts the owned engine, exchanges the token and synchronizes settings before ready', async () => {
    process.env.FAKE_STATE = join(dir, 'rpc.jsonl')
    const engine = create({}, { ...DEFAULT_SETTINGS, theme: 'dark', language: 'en' })
    const phases: string[] = []
    engine.on('status', status => phases.push(status.phase))
    await engine.start()
    expect(engine.status().phase).toBe('ready')
    expect(engine.status().bridgeUrl).toContain('/__dshf/bootstrap?ticket=')
    expect(phases).toEqual(['starting', 'ready'])
    const calls = (await readFile(process.env.FAKE_STATE!, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(calls.map(call => call.method)).toEqual(['settings/update', 'settings/update'])
    expect(calls[0].args).toEqual({ ns: 'locale', patch: { preference: 'en' } })
    expect(calls[1].args).toEqual({ ns: 'ui-theme', patch: { preference: 'dark' } })
    expect(calls[0].cookie).toContain('dsh-auth-test=session')
    await engine.stop()
    expect(engine.status().phase).toBe('stopped')
    expect(engine.status().bridgeUrl).toBeUndefined()
  })
  it('deduplicates concurrent starts and ignores restarts after dispose', async () => {
    const engine = create()
    await Promise.all([engine.start(), engine.start(), engine.start()])
    expect(engine.status().attempts).toBe(1)
    await engine.dispose()
    await engine.start()
    expect(engine.status().phase).toBe('ready')
    await engine.dispose()
  })
  it('creates workspaces through the typed RPC envelope', async () => {
    const engine = create()
    await engine.start()
    expect(await engine.createWorkspace('/tmp/proyecto')).toEqual({ workspaceId: 'ws-test', path: '/tmp/proyecto' })
    await expect(engine.rpc('test/fail', {})).rejects.toThrow('test/rejected: rechazado')
    await expect(engine.rpc('../evil', {})).rejects.toThrow('Método RPC no válido')
  })
  it('reports missing runtime files without spawning', async () => {
    const engine = create({ nodeBinary: join(dir, 'missing-node'), cliPath: fixture })
    await expect(engine.start()).rejects.toThrow('Falta el motor incluido')
    expect(engine.status().phase).toBe('error')
  })
  it('reports early exits and spawn errors', async () => {
    process.env.FAKE_MODE = 'early-exit'
    const engine = create()
    await expect(engine.start()).rejects.toThrow('terminó antes de estar listo')
    expect(engine.status().phase).toBe('error')
    const notExecutable = join(dir, 'not-executable')
    await writeFile(notExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o644 })
    const missing = create({ nodeBinary: notExecutable })
    await expect(missing.start()).rejects.toThrow('No se pudo iniciar Node')
  })
  it('times out silent engines and terminates the process group', async () => {
    process.env.FAKE_MODE = 'silent'
    const engine = create({ startupTimeoutMs: 150 })
    await expect(engine.start()).rejects.toThrow('no estuvo listo')
    expect(engine.status().phase).toBe('error')
  })
  it('escalates SIGTERM to SIGKILL for stubborn children', async () => {
    process.env.FAKE_MODE = 'ignore-term'
    process.env.FAKE_STATE = join(dir, 'events.jsonl')
    const engine = create({ stopTimeoutMs: 100 })
    await engine.start()
    await engine.stop()
    expect(engine.status().phase).toBe('stopped')
    expect(await readFile(process.env.FAKE_STATE!, 'utf8')).toContain('ignoredTerm')
  })
  it('restarts cleanly and rotates bridge tickets', async () => {
    const engine = create()
    await engine.start()
    const first = engine.status().bridgeUrl!
    const rotated = engine.status().bridgeUrl!
    expect(rotated).not.toBe(first)
    await engine.restart()
    expect(engine.status().phase).toBe('ready')
    expect(engine.status().attempts).toBe(2)
    expect(engine.status().bridgeUrl).not.toBe(first)
  })
  it('detects unexpected exits and can auto-restart with a bounded backoff', async () => {
    process.env.FAKE_MODE = 'crash-after-ready'
    const engine = create({ autoRestart: true })
    await engine.start()
    await vi.waitFor(() => expect(engine.status().phase).toBe('error'), { timeout: 2000 })
    delete process.env.FAKE_MODE
    await vi.waitFor(() => expect(engine.status().phase).toBe('ready'), { timeout: 4000 })
    expect(engine.status().attempts).toBeGreaterThanOrEqual(2)
  })
  it('applies settings while ready and tolerates synchronization failures', async () => {
    const engine = create()
    await engine.start()
    await engine.applySettings({ ...DEFAULT_SETTINGS, theme: 'light' })
    await engine.stop()
    await expect(engine.applySettings(DEFAULT_SETTINGS)).resolves.toBeUndefined()
    const rpc = vi.spyOn(engine, 'rpc').mockRejectedValue(new Error('sin conexión'))
    await engine.start()
    expect(engine.status().phase).toBe('ready')
    expect(await log.read()).toContain('No se pudo sincronizar')
    rpc.mockRestore()
  })
  it('captures stderr in diagnostics without leaking launch tokens', async () => {
    process.env.FAKE_MODE = 'stderr'
    const engine = create()
    await engine.start()
    const text = await log.read()
    expect(text).toContain('advertencia de prueba')
    expect(text).not.toContain('t'.repeat(43))
  })
  it('rejects RPC before startup and after stop', async () => {
    const engine = create()
    await expect(engine.rpc('settings/update', {})).rejects.toThrow('todavía no está listo')
    await engine.start()
    await engine.stop()
    await expect(engine.createWorkspace('/tmp')).rejects.toThrow('todavía no está listo')
  })
})
