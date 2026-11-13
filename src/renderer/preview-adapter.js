/* Development-only adapter. The native application never loads this file. */
(() => {
  const listeners = new Set()
  async function command(channel, payload) {
    const response = await fetch('/__desktop/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload === undefined ? { channel } : { channel, payload }) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'La vista previa no pudo completar la operación')
    return body.value
  }
  const api = {
    getState: () => command('state:get'),
    getEngineStatus: () => command('engine:status'),
    setSettings: patch => command('settings:set', patch),
    chooseWorkspace: () => new Promise(resolve => {
      window.dispatchEvent(new CustomEvent('dshf:pick-workspace', { detail: { resolve } }))
    }),
    chooseTemplateParent: async () => null,
    checkWorkspaces: () => command('workspace:availability'),
    openWorkspace: path => command('workspace:open', { path }),
    forgetWorkspace: path => command('workspace:forget', { path }),
    favoriteWorkspace: (path, favorite) => command('workspace:favorite', { path, favorite }),
    aliasWorkspace: (path, alias) => command('workspace:alias', { path, alias }),
    pruneMissingWorkspaces: () => command('workspace:prune-missing'),
    createTemplate: (parentPath, name, template) => command('workspace:create-template', { parentPath, name, template }),
    exportPreferences: async () => {
      const backup = await command('preferences:export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2) + '\n'], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'dsh-fedora-preferencias.json'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return 'dsh-fedora-preferencias.json'
    },
    previewPreferencesImport: json => command('preferences:preview-import', { json }),
    applyPreferencesImport: json => command('preferences:apply-import', { json }),
    restartEngine: () => command('engine:restart'),
    stopEngine: () => command('engine:stop'),
    getDiagnostics: () => command('diagnostics:get'),
    checkUpdates: () => command('updates:check'),
    exportDiagnostics: async () => {
      const anchor = document.createElement('a')
      anchor.href = '/__desktop/export'
      anchor.download = 'dsh-fedora-diagnostico.txt'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      return 'dsh-fedora-diagnostico.txt'
    },
    openExternal: async destination => {
      const links = { documentation: 'https://github.com/deepseek-ai/deepseek-harness', source: 'https://github.com/JINROO1/DSH_F', privacy: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md' }
      const url = links[destination]
      if (!url) throw new Error('Destino externo no permitido')
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    windowAction: async () => {},
    subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) },
  }
  window.dshDesktop = Object.freeze(api)
  const events = new EventSource('/__desktop/events')
  events.onmessage = event => { const status = JSON.parse(event.data); for (const callback of listeners) callback(status) }
})()
