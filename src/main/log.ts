import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/gu
export function redact(text: string): string {
  return text.replace(ANSI, '')
    .replace(/([?&](?:token|key|api_key)=)[^\s&)]+/giu, '$1[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie)\s*[:=]\s*(?:bearer\s+)?)[^\r\n]+/giu, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|secret|password|access[_-]?token)\s*[":=]+\s*)[^\s,;"}]+/giu, '$1[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, '[REDACTED]')
}

/** Bounded, redacted-at-ingestion diagnostics. Logging failure never stops the agent. */
export class DiagnosticLog {
  private tail = ''
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly path: string, private readonly maxBytes = 512 * 1024) {}

  write(level: 'info' | 'warn' | 'error', message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${redact(message).replace(/[\r\n]+/gu, ' ').slice(0, 4096)}\n`
    this.tail = (this.tail + line).slice(-this.maxBytes)
    this.pending = this.pending.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      try { if ((await stat(this.path)).size >= this.maxBytes) await rename(this.path, `${this.path}.1`) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await writeFile(this.path, line, { flag: 'a', mode: 0o600 })
    }).catch(() => { /* Diagnostics are best effort; never log the logger's own failure recursively. */ })
  }

  async flush(): Promise<void> { await this.pending }

  async read(): Promise<string> {
    await this.pending
    try { return redact(await readFile(this.path, 'utf8')).slice(-this.maxBytes) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.tail
      return this.tail
    }
  }
}
