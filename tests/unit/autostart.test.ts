import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { autostartPath, desktopExec, readAutostart, setAutostart } from '../../src/main/autostart.js'
import { APP_ID } from '../../src/shared/contracts.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-autostart-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('XDG autostart', () => {
  it('writes a private Plasma desktop entry and removes it idempotently', async () => {
    await setAutostart({ enabled: true, configHome: dir, executable: '/opt/DeepSeek Harness/dsh-fedora' })
    const path = autostartPath(dir)
    expect(path).toBe(join(dir, 'autostart', `${APP_ID}.desktop`))
    const text = await readFile(path, 'utf8')
    expect(text).toContain('Exec="/opt/DeepSeek Harness/dsh-fedora"')
    expect(text).toContain('X-KDE-autostart-after=panel')
    expect(text).toContain('Icon=dsh-fedora')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await setAutostart({ enabled: false, configHome: dir })
    await setAutostart({ enabled: false, configHome: dir })
    expect(await readAutostart(dir)).toBeUndefined()
  })
  it('quotes development app paths and escapes desktop field codes', () => {
    expect(desktopExec('/usr/bin/electron', ['/home/user/My App'])).toBe('"/usr/bin/electron" "/home/user/My App"')
    expect(desktopExec('/opt/app/$pecial"\\`')).toBe('"/opt/app/\\$pecial\\"\\\\\\`"')
    expect(desktopExec('/opt/100%/app')).toBe('"/opt/100%%/app"')
    expect(() => desktopExec('/opt/app\nExec=evil')).toThrow()
  })
  it('rejects relative config homes and executables', async () => {
    expect(() => autostartPath('relativo')).toThrow()
    await expect(setAutostart({ enabled: true, configHome: dir, executable: 'electron' })).rejects.toThrow()
  })
  it('includes the app path only for unpackaged development runs', async () => {
    await setAutostart({ enabled: true, configHome: dir, executable: '/usr/bin/electron', appPath: '/home/user/DSH_F' })
    expect(await readAutostart(dir)).toContain('Exec="/usr/bin/electron" "/home/user/DSH_F"')
  })
})
