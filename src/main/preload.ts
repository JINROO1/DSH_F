import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, EngineStatus } from '../shared/contracts.js'

const invoke = (channel: string, payload?: unknown): Promise<unknown> => ipcRenderer.invoke('dshf:command', payload === undefined ? { channel } : { channel, payload })
const api: DesktopApi = {
  getState: () => invoke('state:get') as ReturnType<DesktopApi['getState']>,
  setSettings: patch => invoke('settings:set', patch) as ReturnType<DesktopApi['setSettings']>,
  chooseWorkspace: () => invoke('workspace:choose') as ReturnType<DesktopApi['chooseWorkspace']>,
  openWorkspace: path => invoke('workspace:open', { path }) as ReturnType<DesktopApi['openWorkspace']>,
  forgetWorkspace: path => invoke('workspace:forget', { path }) as ReturnType<DesktopApi['forgetWorkspace']>,
  getEngineStatus: () => invoke('engine:status') as ReturnType<DesktopApi['getEngineStatus']>,
  restartEngine: () => invoke('engine:restart') as ReturnType<DesktopApi['restartEngine']>,
  stopEngine: () => invoke('engine:stop') as ReturnType<DesktopApi['stopEngine']>,
  getDiagnostics: () => invoke('diagnostics:get') as ReturnType<DesktopApi['getDiagnostics']>,
  exportDiagnostics: () => invoke('diagnostics:export') as ReturnType<DesktopApi['exportDiagnostics']>,
  checkUpdates: () => invoke('updates:check') as ReturnType<DesktopApi['checkUpdates']>,
  openExternal: destination => invoke('external:open', { destination }) as Promise<void>,
  windowAction: action => invoke('window:action', { action }) as Promise<void>,
  subscribe: callback => {
    const listener = (_event: Electron.IpcRendererEvent, status: EngineStatus): void => callback(status)
    ipcRenderer.on('dshf:engine-status', listener)
    return () => ipcRenderer.off('dshf:engine-status', listener)
  },
}
contextBridge.exposeInMainWorld('dshDesktop', Object.freeze(api))
