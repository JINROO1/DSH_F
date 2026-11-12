import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DiagnosticLog, redact } from '../../src/main/log.js'
import { collectDiagnostics, diagnosticsText } from '../../src/main/diagnostics.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-log-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('redaction', () => {
  it('removes launch tokens, authorization headers, cookies and API keys', () => {
    const text = 'dsh web: http://127.0.0.1:3080/?token=abc123_-DEF\nAuthorization: Bearer secreto\nCookie: dsh-auth=valor\napi_key: sk-abcdefghijklmnop\npassword="hunter2"'
    const result = redact(text)
    expect(result).not.toContain('abc123_-DEF')
    expect(result).not.toContain('secreto')
    expect(result).not.toContain('valor')
    expect(result).not.toContain('sk-abcdefghijklmnop')
    expect(result).not.toContain('hunter2')
    expect(result).toContain('[REDACTED]')
  })
  it('strips ANSI and redacts bare provider keys', () => {
    expect(redact('\x1b[31merror\x1b[0m sk-1234567890abcdef')).toBe('error [REDACTED]')
  })
})

describe('DiagnosticLog', () => {
  it('writes private redacted lines and reads them back', async () => {
    const path = join(dir, 'logs/desktop.log')
    const log = new DiagnosticLog(path)
    log.write('info', 'inicio ?token=secreto')
    log.write('error', 'fallo\nsegunda línea')
    const text = await log.read()
    expect(text).toContain('[info] inicio ?token=[REDACTED]')
    expect(text).toContain('[error] fallo segunda línea')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })
  it('rotates bounded logs and keeps the tail readable', async () => {
    const path = join(dir, 'desktop.log')
    const log = new DiagnosticLog(path, 512)
    for (let index = 0; index < 20; index++) log.write('info', `línea ${index} ${'x'.repeat(80)}`)
    const text = await log.read()
    expect(text.length).toBeLessThanOrEqual(512)
    expect(text).toContain('línea 19')
    expect((await stat(`${path}.1`)).size).toBeGreaterThan(0)
  })
  it('returns the in-memory tail when the file is missing or unreadable', async () => {
    const log = new DiagnosticLog(join(dir, 'missing.log'))
    expect(await log.read()).toBe('')
    log.write('warn', 'todavía en memoria')
    await rm(join(dir, 'missing.log'), { force: true })
    expect(await log.read()).toContain('todavía en memoria')
  })
  it('never throws when the log path cannot be written', async () => {
    const blocker = join(dir, 'blocker')
    await writeFile(blocker, 'x')
    const log = new DiagnosticLog(join(blocker, 'desktop.log'))
    expect(() => log.write('error', 'fallo de logger')).not.toThrow()
    expect(await log.read()).toContain('fallo de logger')
  })
})

describe('diagnostics', () => {
  it('collects release facts and strips bridge capabilities', async () => {
    const release = join(dir, 'os-release')
    const logPath = join(dir, 'desktop.log')
    await writeFile(release, 'PRETTY_NAME="Fedora Linux 43 (KDE Plasma)"\nID=fedora\n')
    await writeFile(logPath, 'línea ?token=secreto')
    const value = await collectDiagnostics({ appVersion: '0.1.0', engine: { phase: 'ready', message: 'ok', attempts: 1, version: '0.2.2-rc.2', bridgeUrl: 'http://127.0.0.1:1/__dshf/bootstrap?ticket=secreto' }, logPath, releasePath: release })
    expect(value.platform).toBe('Fedora Linux 43 (KDE Plasma)')
    expect(value.engine.bridgeUrl).toBeUndefined()
    expect(value.log).not.toContain('secreto')
    const text = diagnosticsText(value)
    expect(text).toContain('diagnóstico')
    expect(text).not.toContain('ticket=secreto')
  })
  it('degrades gracefully without os-release or logs', async () => {
    const value = await collectDiagnostics({ appVersion: '0.1.0', engine: { phase: 'stopped', message: '', attempts: 0, version: '' }, logPath: join(dir, 'missing'), releasePath: join(dir, 'missing-release') })
    expect(value.platform).toBe(process.platform)
    expect(value.log).toBe('')
  })
})
