import { _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const userData = await mkdtemp(join(tmpdir(), 'dshf-electron-smoke-'))
let app
try {
  app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, DSH_TELEMETRY_DISABLED: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    timeout: 60_000,
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-shell:not(.loading)', { timeout: 30_000 })
  const state = await page.evaluate(() => window.dshDesktop.getState())
  if (state.settings.language !== 'es') throw new Error('El idioma inicial no es español')
  await page.evaluate(() => window.dshDesktop.setSettings({ confirmQuit: false, closeToTray: false, theme: 'dark' }))
  await page.waitForFunction(async () => (await window.dshDesktop.getEngineStatus()).phase === 'ready', undefined, { timeout: 90_000 })
  const diagnostics = await page.evaluate(() => window.dshDesktop.getDiagnostics())
  if (!diagnostics.electron || diagnostics.engine.bridgeUrl) throw new Error('Diagnóstico nativo inválido')
  await page.evaluate(() => window.dshDesktop.restartEngine())
  await page.waitForFunction(async () => (await window.dshDesktop.getEngineStatus()).phase === 'ready', undefined, { timeout: 90_000 })
  await page.screenshot({ path: join(root, 'test-results/electron-smoke.png') })
  await page.evaluate(() => window.dshDesktop.windowAction('close'))
  await app.close()
  app = undefined
  console.log('Electron smoke OK: ventana, IPC, motor real, reinicio y cierre limpio.')
} finally {
  if (app) await app.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
