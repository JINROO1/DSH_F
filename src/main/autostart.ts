import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { APP_ID } from '../shared/contracts.js'

/** Electron's login-item API is macOS/Windows-only; Plasma reads XDG autostart entries. */
export function autostartPath(configHome: string): string {
  if (!isAbsolute(configHome)) throw new Error('XDG_CONFIG_HOME debe ser una ruta absoluta')
  return join(configHome, 'autostart', `${APP_ID}.desktop`)
}

/** Desktop Entry Exec quoting (backslash, double quote, backtick and dollar). */
export function desktopExec(path: string, args: readonly string[] = []): string {
  const quote = (value: string): string => {
    if (/[\r\n\0]/u.test(value)) throw new Error('El lanzador no admite saltos de línea ni NUL')
    return `"${value.replace(/[\\`$"]/gu, character => `\\${character}`)}"`
  }
  return [path, ...args].map(quote).join(' ').replaceAll('%', '%%')
}

export type AutostartOptions = { configHome: string } & ({ enabled: false } | { enabled: true; executable: string; appPath?: string })

export async function setAutostart(options: AutostartOptions): Promise<void> {
  const path = autostartPath(options.configHome)
  if (!options.enabled) { await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error }); return }
  if (!isAbsolute(options.executable)) throw new Error('El ejecutable debe tener una ruta absoluta')
  const entry = [
    '[Desktop Entry]', 'Type=Application', 'Version=1.0',
    'Name=DeepSeek Harness', 'Comment=Espacio de trabajo de agentes para Fedora KDE',
    `Exec=${desktopExec(options.executable, options.appPath ? [options.appPath] : [])}`,
    'Icon=dsh-fedora', 'Terminal=false', 'Categories=Development;',
    'StartupWMClass=dsh-fedora', 'X-KDE-autostart-after=panel',
    'X-GNOME-Autostart-enabled=true', '',
  ].join('\n')
  await mkdir(join(options.configHome, 'autostart'), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, entry, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

export async function readAutostart(configHome: string): Promise<string | undefined> {
  try { return await readFile(autostartPath(configHome), 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
