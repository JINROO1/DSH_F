import { mkdir, readFile, rename, writeFile, copyFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { desktopStateSchema, settingsPatchSchema, preferencesBackupSchema, type DesktopState, type SettingsPatch, type RecentWorkspace, type PreferencesBackup, type PreferencesImportPreview } from '../shared/contracts.js'

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
    const previous = this.state.recent.find(entry => entry.path === path)
    const item: RecentWorkspace = { path, name: basename(path) || path, lastOpened: new Date().toISOString(), favorite: previous?.favorite ?? false, ...(previous?.alias ? { alias: previous.alias } : {}) }
    this.state.recent = [item, ...this.state.recent.filter(entry => entry.path !== path)].slice(0, 20)
    await this.persist()
    return { ...item }
  }

  async forgetWorkspace(path: string): Promise<DesktopState> {
    this.state.recent = this.state.recent.filter(entry => entry.path !== path)
    await this.persist()
    return this.snapshot()
  }

  async favoriteWorkspace(path: string, favorite: boolean): Promise<DesktopState> {
    const item = this.state.recent.find(entry => entry.path === path)
    if (!item) throw new Error('El proyecto no está en recientes')
    item.favorite = favorite
    await this.persist()
    return this.snapshot()
  }

  async aliasWorkspace(path: string, alias: string): Promise<DesktopState> {
    const item = this.state.recent.find(entry => entry.path === path)
    if (!item) throw new Error('El proyecto no está en recientes')
    const trimmed = alias.trim()
    if (trimmed) item.alias = trimmed.slice(0, 120)
    else delete item.alias
    await this.persist()
    return this.snapshot()
  }

  async pruneMissingWorkspaces(missingPaths: readonly string[]): Promise<DesktopState> {
    const missing = new Set(missingPaths)
    this.state.recent = this.state.recent.filter(entry => !missing.has(entry.path))
    await this.persist()
    return this.snapshot()
  }

  exportPreferences(): PreferencesBackup {
    return preferencesBackupSchema.parse({ schemaVersion: 1, exportedAt: new Date().toISOString(), settings: this.state.settings })
  }

  previewPreferencesImport(json: string): PreferencesImportPreview {
    const backup = preferencesBackupSchema.parse(JSON.parse(json))
    const changes = (Object.keys(backup.settings) as (keyof typeof backup.settings)[]).filter(key => backup.settings[key] !== this.state.settings[key])
    return { settings: backup.settings, changes }
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
