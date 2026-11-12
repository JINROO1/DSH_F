import { readFile } from 'node:fs/promises'
import type { Diagnostics, EngineStatus } from '../shared/contracts.js'
import { UPSTREAM_VERSION } from '../shared/contracts.js'
import { redact } from './log.js'

export async function collectDiagnostics(options: {
  appVersion: string
  engine: EngineStatus
  logPath: string
  releasePath?: string
}): Promise<Diagnostics> {
  let release = ''
  try { release = await readFile(options.releasePath ?? '/etc/os-release', 'utf8') } catch { /* Non-Linux development host. */ }
  const os = /^PRETTY_NAME="?([^"\n]+)"?/mu.exec(release)?.[1] ?? process.platform
  const { bridgeUrl: _secret, ...engine } = options.engine
  return {
    appVersion: options.appVersion, upstreamVersion: UPSTREAM_VERSION,
    platform: os, arch: process.arch,
    electron: process.versions.electron ?? 'no disponible (vista previa)',
    node: process.versions.node, chrome: process.versions.chrome ?? 'no disponible',
    sessionType: process.env.XDG_SESSION_TYPE ?? 'desconocida',
    engine, log: redact(await readFile(options.logPath, 'utf8').catch(() => '')).slice(-64_000),
  }
}

export function diagnosticsText(value: Diagnostics): string {
  const { log, ...facts } = value
  return `DeepSeek Harness Fedora — diagnóstico\n${JSON.stringify(facts, null, 2)}\n\nRegistro (secretos redactados)\n${log}\n`
}
