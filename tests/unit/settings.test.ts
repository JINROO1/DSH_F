import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DesktopStore } from '../../src/main/settings.js'
import { DEFAULT_SETTINGS } from '../../src/shared/contracts.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-settings-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('DesktopStore', () => {
  it('creates default preferences with private permissions', async () => {
    const path = join(dir, 'desktop.json')
    const store = new DesktopStore(path)
    const state = await store.load()
    expect(state.settings).toEqual(DEFAULT_SETTINGS)
    expect(state.recent).toEqual([])
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
  })
  it('persists patches atomically and keeps a backup', async () => {
    const path = join(dir, 'desktop.json')
    const store = new DesktopStore(path)
    await store.load()
    await store.updateSettings({ theme: 'light', language: 'en' })
    await store.updateSettings({ reduceMotion: true })
    const state = store.snapshot()
    expect(state.settings.theme).toBe('light')
    expect(state.settings.language).toBe('en')
    expect(state.settings.reduceMotion).toBe(true)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(state)
    expect(JSON.parse(await readFile(`${path}.bak`, 'utf8')).settings.theme).toBe('light')
    expect((await readdir(dir)).some(name => name.endsWith('.tmp'))).toBe(false)
  })
  it('ignores undefined patch fields instead of erasing defaults', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    await store.load()
    const state = await store.updateSettings({ theme: undefined, language: 'en' })
    expect(state.settings.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(state.settings.language).toBe('en')
  })
  it('rejects unknown keys, invalid enums and non-boolean flags', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    await store.load()
    await expect(store.updateSettings({ theme: 'neon' })).rejects.toThrow()
    await expect(store.updateSettings({ shell: 'rm -rf' })).rejects.toThrow()
    await expect(store.updateSettings({ closeToTray: 'yes' })).rejects.toThrow()
    expect(store.snapshot().settings).toEqual(DEFAULT_SETTINGS)
  })
  it('persiste la guía de inicio como preferencia no sensible y permite reabrirla', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    expect((await store.load()).settings.onboardingDismissed).toBe(false)
    expect((await store.updateSettings({ onboardingDismissed: true })).settings.onboardingDismissed).toBe(true)
    const reloaded = new DesktopStore(join(dir, 'desktop.json'))
    expect((await reloaded.load()).settings.onboardingDismissed).toBe(true)
    expect((await reloaded.updateSettings({ onboardingDismissed: false })).settings.onboardingDismissed).toBe(false)
  })
  it('recovers corrupted primary files from backup and preserves evidence', async () => {
    const path = join(dir, 'desktop.json')
    await writeFile(path, '{roto')
    await writeFile(`${path}.bak`, JSON.stringify({ settings: { theme: 'dark' }, recent: [] }))
    const store = new DesktopStore(path)
    const state = await store.load()
    expect(state.settings.theme).toBe('dark')
    expect(store.recoveryNotice).toBeTruthy()
    expect((await readdir(dir)).some(name => name.includes('.corrupt-'))).toBe(true)
  })
  it('falls back to safe defaults when both copies are malformed', async () => {
    const path = join(dir, 'desktop.json')
    await writeFile(path, '{roto')
    await writeFile(`${path}.bak`, '{roto también')
    const store = new DesktopStore(path)
    expect((await store.load()).settings).toEqual(DEFAULT_SETTINGS)
    expect(store.recoveryNotice).toBeTruthy()
  })
  it('deduplicates, orders and caps recent workspaces without touching files', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    await store.load()
    for (let index = 0; index < 22; index++) await store.rememberWorkspace(join(dir, `proyecto-${index}`))
    await store.rememberWorkspace(join(dir, 'proyecto-21'))
    const state = store.snapshot()
    expect(state.recent).toHaveLength(20)
    expect(state.recent[0]?.name).toBe('proyecto-21')
    expect(new Set(state.recent.map(item => item.path)).size).toBe(20)
    const after = await store.forgetWorkspace(join(dir, 'proyecto-21'))
    expect(after.recent).toHaveLength(19)
  })
  it('rejects relative, NUL, newline and oversized workspace paths', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    await store.load()
    for (const path of ['relativo', '/tmp/\0x', '/tmp/\nx', '/'.repeat(5000)]) {
      await expect(store.rememberWorkspace(path)).rejects.toThrow()
    }
  })
  it('serializes concurrent writes without losing updates', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    await store.load()
    await Promise.all([
      store.updateSettings({ theme: 'dark' }),
      store.updateSettings({ language: 'en' }),
      store.rememberWorkspace(join(dir, 'a')),
      store.rememberWorkspace(join(dir, 'b')),
    ])
    await store.flush()
    const state = JSON.parse(await readFile(join(dir, 'desktop.json'), 'utf8'))
    expect(state.settings.theme).toBe('dark')
    expect(state.settings.language).toBe('en')
    expect(state.recent).toHaveLength(2)
  })
  it('returns snapshots that cannot mutate internal state', async () => {
    const store = new DesktopStore(join(dir, 'desktop.json'))
    await store.load()
    const snapshot = store.snapshot()
    snapshot.settings.theme = 'light'
    snapshot.recent.push({ path: '/x', name: 'x', lastOpened: new Date().toISOString() })
    expect(store.snapshot().settings.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(store.snapshot().recent).toEqual([])
  })
})
