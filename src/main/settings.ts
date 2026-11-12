import { mkdir, readFile, rename, writeFile, copyFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { desktopStateSchema, settingsPatchSchema, type DesktopState, type SettingsPatch, type RecentWorkspace } from '../shared/contracts.js'

/** Atomic, permission-restricted preferences; malformed input never becomes executable configuration. */
export class DesktopStore {
  private state: DesktopState = desktopStateSchema.parse({ settings: {}, recent: [] })
  private queue: Promise<void> = Promise.resolve()
  recoveryNotice: string | undefined
  constructor(private readonly path: string) {}

  async load(): Promise<DesktopState> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    for (const candidate of [this.path, `${this.path}.bak`]) {
      try {
        this.state = desktopStateSchema.parse(JSON.parse(await readFile(candidate, 'utf8')))
        if (candidate !== this.path) this.recoveryNotice = 'Preferencias recuperadas de la copia de seguridad.'
        return this.snapshot()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        if (candidate === this.path) {
          await rename(candidate, `${this.path}.corrupt-${Date.now()}`).catch(() => undefined)
          this.recoveryNotice = 'Las preferencias dañadas se conservaron en una copia; se restauraron los valores seguros.'
        }
      }
    }
    await this.persist()
    return this.snapshot()
  }

  snapshot(): DesktopState { return structuredClone(this.state) }

  async updateSettings(input: unknown): Promise<DesktopState> {
    const patch = settingsPatchSchema.parse(input)
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
    this.state.settings = { ...this.state.settings, ...defined }
    await this.persist()
    return this.snapshot()
  }

  async rememberWorkspace(path: string): Promise<RecentWorkspace> {
    if (!isAbsolute(path) || path.includes('\0') || path.includes('\n') || path.length > 4096) throw new Error('Selecciona una carpeta absoluta válida')
    const item = { path, name: basename(path) || path, lastOpened: new Date().toISOString() }
    this.state.recent = [item, ...this.state.recent.filter(entry => entry.path !== path)].slice(0, 20)
    await this.persist()
    return { ...item }
  }

  async forgetWorkspace(path: string): Promise<DesktopState> {
    this.state.recent = this.state.recent.filter(entry => entry.path !== path)
    await this.persist()
    return this.snapshot()
  }

  private persist(): Promise<void> {
    const content = JSON.stringify(this.state, null, 2) + '\n'
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const temporary = `${this.path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, content, { mode: 0o600, flag: 'wx' })
        try { await copyFile(this.path, `${this.path}.bak`) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await rename(temporary, this.path)
      } catch (error) {
        const { unlink } = await import('node:fs/promises')
        await unlink(temporary).catch(() => undefined)
        throw error
      }
    })
    return this.queue
  }

  async flush(): Promise<void> { await this.queue }
}
