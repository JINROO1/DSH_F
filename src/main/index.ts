import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, protocol, session, shell, Tray } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { APP_ID, APP_ORIGIN, EXTERNAL_LINKS, commandSchema, errorMessage, type EngineStatus } from '../shared/contracts.js'
import { DesktopStore } from './settings.js'
import { DiagnosticLog, redact } from './log.js'
import { HarnessRuntime } from './runtime.js'
import { collectDiagnostics, diagnosticsText } from './diagnostics.js'
import { checkForUpdates } from './updates.js'
import { notificationForStatus } from './notifications.js'
import { createTemplate } from './templates.js'
import { checkWorkspacePaths, missingWorkspacePaths } from './workspaces.js'
import { validAppSender, validateExternalUrl, allowedPermission, allowedNavigation } from './security.js'
import { setAutostart } from './autostart.js'

const directory = dirname(fileURLToPath(import.meta.url))
app.setAppUserModelId(APP_ID)
app.setName('DeepSeek Harness Fedora')
const gotLock = app.requestSingleInstanceLock()
let window: BrowserWindow | undefined
let tray: Tray | undefined
let quitting = false
let runtime: HarnessRuntime | undefined
let store: DesktopStore | undefined
let log: DiagnosticLog | undefined
let status: EngineStatus = { phase: 'stopped', message: 'Preparando…', attempts: 0, version: '' }

protocol.registerSchemesAsPrivileged([{ scheme: 'dshf', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

function broadcast(next: EngineStatus): void {
  const previous = status
  status = next
  const notice = notificationForStatus(previous, next, store?.snapshot().settings.notificationsEnabled ?? false)
  if (notice && Notification.isSupported()) new Notification(notice).show()
  if (window && !window.isDestroyed()) {
    const { bridgeUrl: _url, ...safe } = next
    window.webContents.send('dshf:engine-status', next)
    window.webContents.send('dshf:engine-summary', safe)
  }
}

async function chooseWorkspace(): Promise<string | null> {
  if (!window) return null
  const result = await dialog.showOpenDialog(window, { title: 'Selecciona la carpeta de tu proyecto', properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Abrir proyecto' })
  return result.canceled ? null : result.filePaths[0] ?? null
}

async function chooseTemplateParent(): Promise<string | null> {
  if (!window) return null
  const result = await dialog.showOpenDialog(window, { title: 'Selecciona la carpeta donde crear el proyecto', properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Usar carpeta' })
  return result.canceled ? null : result.filePaths[0] ?? null
}

async function openWorkspace(path: string): Promise<import('../shared/contracts.js').RecentWorkspace> {
  const info = await stat(path)
  if (!info.isDirectory()) throw new Error('La ruta seleccionada no es una carpeta')
  const canonical = await realpath(path)
  await runtime!.createWorkspace(canonical)
  return store!.rememberWorkspace(canonical)
}

async function createWorkspaceTemplate(parentPath: string, name: string, template: import('../shared/contracts.js').TemplateKind): Promise<import('../shared/contracts.js').RecentWorkspace> {
  const info = await stat(parentPath)
  if (!info.isDirectory()) throw new Error('La carpeta de destino no existe')
  const target = await createTemplate(await realpath(parentPath), name, template)
  await runtime!.createWorkspace(target)
  return store!.rememberWorkspace(target)
}

async function applySettings(input: unknown): Promise<import('../shared/contracts.js').DesktopState> {
  const previous = store!.snapshot().settings
  const next = await store!.updateSettings(input)
  try {
    nativeTheme.themeSource = next.settings.theme
    await runtime?.applySettings(next.settings)
    await setAutostart({ enabled: next.settings.launchOnLogin, configHome: app.getPath('appData'), executable: process.execPath, ...(!app.isPackaged ? { appPath: app.getAppPath() } : {}) })
  } catch (error) {
    nativeTheme.themeSource = previous.theme
    await store!.updateSettings(previous)
    await setAutostart({ enabled: previous.launchOnLogin, configHome: app.getPath('appData'), executable: process.execPath, ...(!app.isPackaged ? { appPath: app.getAppPath() } : {}) }).catch(() => undefined)
    throw new Error(`No se pudo aplicar la preferencia: ${errorMessage(error)}`)
  }
  return next
}

function installIpc(): void {
  ipcMain.handle('dshf:command', async (event, input: unknown) => {
    if (!window || event.sender !== window.webContents || !validAppSender(event.senderFrame?.url ?? '', APP_ORIGIN)) throw new Error('Origen IPC no autorizado')
    const command = commandSchema.parse(input)
    switch (command.channel) {
      case 'state:get': return store!.snapshot()
      case 'engine:status': return runtime!.status()
      case 'settings:set': return applySettings(command.payload)
      case 'workspace:choose': { const path = await chooseWorkspace(); return path ? openWorkspace(path) : null }
      case 'workspace:choose-parent': return chooseTemplateParent()
      case 'workspace:availability': return checkWorkspacePaths(store!.snapshot().recent.map(item => item.path))
      case 'workspace:open': return openWorkspace(command.payload.path)
      case 'workspace:forget': return store!.forgetWorkspace(command.payload.path)
      case 'workspace:favorite': return store!.favoriteWorkspace(command.payload.path, command.payload.favorite)
      case 'workspace:alias': return store!.aliasWorkspace(command.payload.path, command.payload.alias)
      case 'workspace:prune-missing': return store!.pruneMissingWorkspaces(await missingWorkspacePaths(store!.snapshot().recent.map(item => item.path)))
      case 'workspace:create-template': return createWorkspaceTemplate(command.payload.parentPath, command.payload.name, command.payload.template)
      case 'preferences:export': {
        const backup = store!.exportPreferences()
        const result = await dialog.showSaveDialog(window!, { title: 'Exportar preferencias', defaultPath: `dsh-fedora-preferencias-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
        if (result.canceled || !result.filePath) return null
        await writeFile(result.filePath, JSON.stringify(backup, null, 2) + '\n', { mode: 0o600 })
        return result.filePath
      }
      case 'preferences:preview-import': return store!.previewPreferencesImport(command.payload.json)
      case 'preferences:apply-import': return applySettings(store!.previewPreferencesImport(command.payload.json).settings)
      case 'engine:restart': await runtime!.restart(); return runtime!.status()
      case 'engine:stop': await runtime!.stop(); return runtime!.status()
      case 'diagnostics:get': return collectDiagnostics({ appVersion: app.getVersion(), engine: status, logPath: join(app.getPath('userData'), 'logs/desktop.log'), releasePath: '/etc/os-release' })
      case 'diagnostics:export': {
        const diagnostics = await collectDiagnostics({ appVersion: app.getVersion(), engine: status, logPath: join(app.getPath('userData'), 'logs/desktop.log') })
        const result = await dialog.showSaveDialog(window!, { title: 'Exportar diagnóstico', defaultPath: `dsh-fedora-diagnostico-${new Date().toISOString().slice(0, 10)}.txt`, filters: [{ name: 'Texto', extensions: ['txt'] }] })
        if (result.canceled || !result.filePath) return null
        await writeFile(result.filePath, diagnosticsText(diagnostics), { mode: 0o600 })
        return result.filePath
      }
      case 'updates:check': return checkForUpdates({ appVersion: app.getVersion(), upstreamVersion: runtime!.status().version })
      case 'external:open': await shell.openExternal(validateExternalUrl(EXTERNAL_LINKS[command.payload.destination]).href); return
      case 'window:action': {
        if (command.payload.action === 'minimize') window!.minimize()
        if (command.payload.action === 'maximize') window!.isMaximized() ? window!.unmaximize() : window!.maximize()
        if (command.payload.action === 'close') window!.close()
        return
      }
    }
  })
}

async function createWindow(): Promise<void> {
  const icon = nativeImage.createFromPath(join(directory, 'assets/icon.png'))
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 900, minHeight: 640,
    title: 'DeepSeek Harness · Fedora Edition', backgroundColor: '#101318', show: false,
    autoHideMenuBar: true, icon,
    webPreferences: { preload: join(directory, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, spellcheck: true },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    try { const parsed = validateExternalUrl(url); if (['github.com', 'deepseek.com', 'www.deepseek.com'].includes(parsed.hostname)) void shell.openExternal(parsed.href) } catch { /* Deny silently. */ }
    return { action: 'deny' }
  })
  window.webContents.on('will-frame-navigate', details => {
    if (!allowedNavigation(details.url, details.isMainFrame, runtime?.bridgeOrigin)) details.preventDefault()
  })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.once('ready-to-show', () => window?.show())
  window.on('close', event => {
    if (!quitting && tray && store?.snapshot().settings.closeToTray) { event.preventDefault(); window?.hide(); tray.displayBalloon?.({ title: 'DeepSeek Harness sigue disponible', content: 'Abre la aplicación desde el icono de la bandeja.' }) }
  })
  window.on('closed', () => { window = undefined })
  await window.loadURL(`${APP_ORIGIN}/index.html`)
}

async function quit(): Promise<void> {
  if (quitting) return
  if (store?.snapshot().settings.confirmQuit && window && status.phase === 'ready') {
    const answer = await dialog.showMessageBox(window, { type: 'question', buttons: ['Cerrar aplicación', 'Continuar trabajando'], defaultId: 1, cancelId: 1, title: '¿Cerrar DeepSeek Harness?', message: 'Se detendrá el motor local.', detail: 'Las sesiones guardadas se conservan. Las tareas en curso pueden interrumpirse.' })
    if (answer.response !== 0) return
  }
  quitting = true
  await runtime?.dispose()
  tray?.destroy()
  app.quit()
}

async function main(): Promise<void> {
  await app.whenReady()
  const userData = app.getPath('userData')
  await mkdir(userData, { recursive: true, mode: 0o700 })
  log = new DiagnosticLog(join(userData, 'logs/desktop.log'))
  store = new DesktopStore(join(userData, 'desktop.json'))
  const state = await store.load()
  nativeTheme.themeSource = state.settings.theme
  const runtimeRoot = app.isPackaged ? join(process.resourcesPath, 'runtime') : join(directory, '../runtime')
  runtime = new HarnessRuntime({ runtimeRoot, home: join(userData, 'harness'), userData, appOrigins: [APP_ORIGIN], log, themeCssPath: join(directory, 'renderer/harness-theme.css'), fontRoot: join(directory, 'renderer/fonts') }, state.settings)
  runtime.on('status', broadcast)
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => callback(allowedPermission(permission, details.requestingUrl, runtime?.bridgeOrigin)))
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin, details) => allowedPermission(permission, details.requestingUrl ?? origin, runtime?.bridgeOrigin))
  session.defaultSession.on('will-download', (_event, item) => {
    let origin = ''
    try { origin = new URL(item.getURL()).origin } catch { /* Deny malformed sources. */ }
    if (origin !== runtime?.bridgeOrigin) item.cancel()
  })
  await protocol.handle('dshf', async request => {
    const url = new URL(request.url)
    if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Forbidden', { status: 403 })
    const root = join(directory, 'renderer')
    try {
      const path = join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
      if (!path.startsWith(root + '/')) return new Response('Forbidden', { status: 403 })
      const body = await readFile(path)
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
      const headers: Record<string, string> = { 'content-type': types[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream', 'cache-control': 'no-cache' }
      if (path.endsWith('.html')) headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'"
      return new Response(body, { headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  installIpc()
  await createWindow()
  const menu = Menu.buildFromTemplate([
    { label: 'Aplicación', submenu: [{ label: 'Mostrar ventana', click: () => { window?.show(); window?.focus() } }, { label: 'Reiniciar motor', click: () => { void runtime?.restart().catch(error => log?.write('error', errorMessage(error))) } }, { type: 'separator' }, { label: 'Salir', click: () => { void quit() } }] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ayuda', submenu: [{ label: 'Documentación', click: () => { void shell.openExternal(EXTERNAL_LINKS.documentation) } }] },
  ])
  Menu.setApplicationMenu(menu)
  try {
    tray = new Tray(join(directory, 'assets/tray.png'))
    tray.setToolTip('DeepSeek Harness · Fedora Edition')
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Abrir DeepSeek Harness', click: () => { window?.show(); window?.focus() } }, { label: 'Salir', click: () => { void quit() } }]))
    tray.on('click', () => { window?.show(); window?.focus() })
  } catch { log.write('warn', 'Bandeja no disponible; se usará la ventana normal.') }
  if (state.settings.launchOnLogin) await setAutostart({ enabled: true, configHome: app.getPath('appData'), executable: process.execPath, ...(!app.isPackaged ? { appPath: app.getAppPath() } : {}) })
  void runtime.start().catch(error => {
    log?.write('error', errorMessage(error))
    if (store?.snapshot().settings.notificationsEnabled && Notification.isSupported()) new Notification({ title: 'No se pudo iniciar Harness', body: 'Abre Diagnóstico para ver el detalle y reintentar.' }).show()
  })
}

app.on('second-instance', () => { window?.show(); window?.focus() })
app.on('before-quit', event => { if (!quitting) { event.preventDefault(); void quit() } })
app.on('window-all-closed', () => { if (quitting || !tray || !store?.snapshot().settings.closeToTray) app.quit() })
process.on('uncaughtException', error => { log?.write('error', redact(errorMessage(error))); dialog.showErrorBox('Error de DeepSeek Harness', redact(errorMessage(error))) })
process.on('unhandledRejection', error => { log?.write('error', redact(errorMessage(error))) })
if (!gotLock) app.quit()
else void main().catch(error => { log?.write('error', errorMessage(error)); dialog.showErrorBox('No se pudo abrir DeepSeek Harness', redact(errorMessage(error))); void runtime?.dispose().finally(() => { quitting = true; app.quit() }) })
