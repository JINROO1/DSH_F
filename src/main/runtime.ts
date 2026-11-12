import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, stat, readFile } from 'node:fs/promises'
import { join, delimiter } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { HarnessBridge, exchangeLaunchToken } from './bridge.js'
import { parseLaunchUrl } from './security.js'
import { redact, type DiagnosticLog } from './log.js'
import { errorMessage, UPSTREAM_VERSION, type EngineStatus, type Settings } from '../shared/contracts.js'

export interface RuntimeOptions {
  runtimeRoot: string
  home: string
  userData: string
  appOrigins: readonly string[]
  log: DiagnosticLog
  nodeBinary?: string
  cliPath?: string
  startupTimeoutMs?: number
  stopTimeoutMs?: number
  autoRestart?: boolean
  guardPath?: string
  themeCssPath?: string
  fontRoot?: string
}
const rpcResponse = z.object({
  type: z.literal('server-response'), rpcId: z.string(),
  result: z.union([z.object({ ok: z.literal(true), value: z.unknown() }), z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) })]),
})

/** Owns exactly one Harness process group and its authenticated, loopback-only bridge. */
export class HarnessRuntime extends EventEmitter {
  private child: ChildProcess | undefined
  private bridge: HarnessBridge | undefined
  private phase: EngineStatus['phase'] = 'stopped'
  private message = 'Motor detenido'
  private attempts = 0
  private stopping = false
  private disposed = false
  private operation: Promise<void> | undefined
  private restartTimer: NodeJS.Timeout | undefined
  private restartCount = 0
  private settings: Settings
  private launchUrl: URL | undefined
  private cookie = ''

  constructor(private readonly options: RuntimeOptions, settings: Settings) {
    super()
    this.settings = settings
  }

  /** Origin of the owned bridge, available during settings synchronization before ready. */
  get bridgeOrigin(): string | undefined { return this.bridge?.origin }

  status(): EngineStatus {
    return { phase: this.phase, message: this.message, attempts: this.attempts, version: UPSTREAM_VERSION,
      ...(this.phase === 'ready' && this.bridge ? { bridgeUrl: this.bridge.bootstrapUrl() } : {}) }
  }

  private set(phase: EngineStatus['phase'], message: string): void {
    this.phase = phase; this.message = redact(message)
    this.options.log.write(phase === 'error' ? 'error' : 'info', `Harness: ${phase}: ${message}`)
    this.emit('status', this.status())
  }

  async start(): Promise<void> {
    if (this.operation) { await this.operation; return }
    if (this.phase === 'ready' || this.phase === 'starting') return
    this.disposed = false; this.stopping = false
    this.operation = this.boot().finally(() => { this.operation = undefined })
    await this.operation
  }

  private async boot(): Promise<void> {
    this.set('starting', 'Preparando tu espacio de trabajo…')
    let child: ChildProcess | undefined
    let bridge: HarnessBridge | undefined
    let timeout: NodeJS.Timeout | undefined
    try {
      await mkdir(this.options.home, { recursive: true, mode: 0o700 })
      await mkdir(join(this.options.userData, 'workspaces'), { recursive: true, mode: 0o700 })
      const node = this.options.nodeBinary ?? join(this.options.runtimeRoot, 'node_modules/node-linux-x64/bin/node')
      const cli = this.options.cliPath ?? join(this.options.runtimeRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
      const nodeInfo = await stat(node).catch(() => undefined)
      const cliInfo = await stat(cli).catch(() => undefined)
      if (!nodeInfo?.isFile() || !cliInfo?.isFile()) throw new Error('Falta el motor incluido. Ejecuta npm run setup antes de iniciar la aplicación.')
      const env: NodeJS.ProcessEnv = { ...process.env }
      for (const key of Object.keys(env)) if (/^(ELECTRON_|NODE_OPTIONS$|DSH_PERMISSION_MODE$|DSH_HOME$|DSH_AGENTS_HOME$|DSH_PRIMARY_RUNTIME$)/u.test(key)) delete env[key]
      Object.assign(env, {
        DSH_HOME: this.options.home,
        DSH_AGENTS_HOME: join(this.options.userData, 'agents'),
        DSH_TELEMETRY_DISABLED: '1',
        DSH_PERMISSION_MODE: 'workspace-write',
        PATH: `${join(this.options.runtimeRoot, 'node_modules/node-linux-x64/bin')}${delimiter}${env.PATH ?? '/usr/bin:/bin'}`,
        NODE_NO_WARNINGS: '1',
      })
      this.attempts++
      const guard = this.options.guardPath ?? fileURLToPath(new URL('./lifecycle-guard.mjs', import.meta.url))
      child = spawn(node, ['--import', pathToFileURL(guard).href, cli, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
        cwd: join(this.options.userData, 'workspaces'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform === 'linux', windowsHide: true,
      })
      this.child = child
      const ownedChild = child
      let stderrTail = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-16_384)
        this.options.log.write('warn', `Harness: ${chunk.toString().trim()}`)
      })
      const url = await new Promise<URL>((resolve, reject) => {
        let stdoutTail = ''
        let settled = false
        const finish = (error?: Error, value?: URL): void => {
          if (settled) return
          settled = true
          if (timeout) clearTimeout(timeout)
          ownedChild.stdout?.off('data', onData)
          if (error) reject(error); else resolve(value!)
        }
        const onData = (chunk: Buffer): void => {
          stdoutTail = (stdoutTail + chunk.toString()).slice(-16_384)
          const parsed = parseLaunchUrl(stdoutTail)
          if (parsed) finish(undefined, parsed)
        }
        child!.stdout?.on('data', onData)
        child!.once('error', error => finish(new Error(`No se pudo iniciar Node: ${error.message}`)))
        child!.once('exit', code => finish(new Error(`Harness terminó antes de estar listo (código ${code ?? 'desconocido'}). ${redact(stderrTail).slice(-1200)}`)))
        const startupTimeoutMs = this.options.startupTimeoutMs ?? 60_000
        timeout = setTimeout(() => finish(new Error(`Harness no estuvo listo en ${Math.round(startupTimeoutMs / 1000)} segundos. Consulta los diagnósticos.`)), startupTimeoutMs)
      })
      if (this.stopping || this.disposed) throw new Error('Inicio cancelado')
      this.launchUrl = url
      this.cookie = await exchangeLaunchToken(url)
      bridge = new HarnessBridge({
        upstream: url.origin, cookie: this.cookie, appOrigins: this.options.appOrigins,
        themeCss: await readFile(this.options.themeCssPath ?? join(this.options.userData, 'harness-theme.css'), 'utf8').catch(() => DEFAULT_THEME),
        ...(this.options.fontRoot ? { fontRoot: this.options.fontRoot } : {}),
      })
      await bridge.listen()
      if (this.stopping || this.disposed) throw new Error('Inicio cancelado')
      this.bridge = bridge
      await this.applySettings(this.settings)
      this.restartCount = 0
      this.set('ready', 'Motor local listo')
      child.once('exit', (code, signal) => {
        if (this.child !== ownedChild) return
        this.child = undefined
        void this.bridge?.close()
        this.bridge = undefined
        this.cookie = ''; this.launchUrl = undefined
        if (this.stopping || this.disposed) { this.set('stopped', 'Motor detenido'); return }
        this.set('error', `Harness se cerró inesperadamente (${code ?? signal ?? 'desconocido'}). Puedes reiniciarlo sin perder tus sesiones.`)
        if (this.options.autoRestart !== false && this.restartCount < 3) {
          const delay = 1000 * 2 ** this.restartCount++
          this.restartTimer = setTimeout(() => { void this.start().catch(() => undefined) }, delay)
        }
      })
    } catch (error) {
      await bridge?.close()
      this.bridge = undefined
      if (child && child.exitCode === null) await this.terminate(child)
      this.child = undefined
      this.cookie = ''; this.launchUrl = undefined
      this.set(this.stopping ? 'stopped' : 'error', this.stopping ? 'Inicio cancelado' : errorMessage(error))
      if (!this.stopping) throw error
    }
  }

  async rpc(method: string, args: Record<string, unknown>): Promise<unknown> {
    if (!['ready', 'starting'].includes(this.phase) || !this.launchUrl || !this.cookie) throw new Error('El motor todavía no está listo')
    if (!/^[a-z][a-z0-9-]*\/[a-z][a-zA-Z0-9-]*$/u.test(method)) throw new Error('Método RPC no válido')
    const response = await fetch(new URL(`/api/${method}`, this.launchUrl.origin), {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: this.cookie, origin: this.launchUrl.origin },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    })
    if (!response.ok) throw new Error(`Harness respondió HTTP ${response.status}`)
    const envelope = rpcResponse.parse(await response.json())
    if (!envelope.result.ok) throw new Error(`${envelope.result.error.code}: ${envelope.result.error.message}`)
    return envelope.result.value
  }

  async applySettings(settings: Settings): Promise<void> {
    this.settings = settings
    if (this.phase !== 'ready' && !(this.phase === 'starting' && this.bridge)) return
    // La release cualificada de Harness solo admite zh/en; la shell en español
    // se sincroniza con el motor en inglés hasta que upstream publique locale es.
    const upstreamLocale = settings.language === 'es' ? 'en' : settings.language
    for (const [ns, patch] of [['locale', { preference: upstreamLocale }], ['ui-theme', { preference: settings.theme }]] as const) {
      try { await this.rpc('settings/update', { ns, patch }) } catch (error) { this.options.log.write('warn', `No se pudo sincronizar ${ns}: ${errorMessage(error)}`) }
    }
  }

  async createWorkspace(path: string): Promise<{ workspaceId: string; path: string }> {
    const value = await this.rpc('workspace/create', { request: { path } })
    const parsed = z.object({ workspace: z.object({ workspaceId: z.string(), path: z.string() }) }).parse(value)
    return parsed.workspace
  }

  async stop(): Promise<void> {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    if (this.phase === 'stopped' && !this.child && !this.bridge) return
    this.stopping = true
    if (this.operation) await this.operation.catch(() => undefined)
    this.set('stopping', 'Guardando el estado y cerrando el motor…')
    const child = this.child
    await this.bridge?.close()
    this.bridge = undefined
    if (child) await this.terminate(child)
    this.child = undefined; this.cookie = ''; this.launchUrl = undefined
    this.set('stopped', 'Motor detenido')
  }

  private async terminate(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    const kill = (signal: NodeJS.Signals): void => {
      try { if (process.platform === 'linux' && child.pid) process.kill(-child.pid, signal); else child.kill(signal) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal)
      }
    }
    try { if (child.connected) child.send({ type: 'dshf:release' }) } catch { /* best-effort */ }
    kill('SIGTERM')
    let timer: NodeJS.Timeout | undefined
    await Promise.race([exited, new Promise<void>(resolve => { timer = setTimeout(() => { kill('SIGKILL'); resolve() }, this.options.stopTimeoutMs ?? 8000) })])
    if (timer) clearTimeout(timer)
    await exited
  }

  async restart(): Promise<void> {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartCount = 0
    await this.stop()
    this.stopping = false
    await this.start()
  }

  async dispose(): Promise<void> { this.disposed = true; await this.stop(); await this.options.log.flush(); this.removeAllListeners() }
}
const DEFAULT_THEME = ''
