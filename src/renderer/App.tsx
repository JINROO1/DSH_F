import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Code2, Command, Copy, Cpu, Download, Folder, FolderOpen, Github, Home, Layers3, LoaderCircle, Monitor, Moon, MoreHorizontal, PlugZap, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Square, Sun, Terminal, Trash2, X, Zap } from 'lucide-react'
import type { DesktopApi, DesktopState, Diagnostics, EngineStatus, RecentWorkspace, Settings, SettingsPatch, UpdateCheck } from '../shared/contracts.js'
import { DEFAULT_SETTINGS, UPSTREAM_NODE_VERSION, UPSTREAM_VERSION, errorMessage } from '../shared/contracts.js'
import { messages, type Messages } from './i18n.js'

declare global { interface Window { dshDesktop: DesktopApi } }
const api = window.dshDesktop
const isPreview = location.protocol !== 'dshf:'
type View = 'home' | 'agent' | 'projects' | 'settings' | 'diagnostics'
type Toast = { id: number; text: string; kind: 'success' | 'error' }
const initialStatus: EngineStatus = { phase: 'starting', message: 'Preparando…', attempts: 0, version: UPSTREAM_VERSION }

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><img src="./assets/icon.svg" alt="" width="38" height="38" /><div><strong>Harness<span className="brand-dot">.</span></strong>{!compact && <span className="edition">EDICIÓN FEDORA</span>}</div></div>
}
function StatusDot({ phase }: { phase: EngineStatus['phase'] }) { return <span className={`status-dot ${phase}`} aria-hidden="true" /> }
function Button({ children, variant = 'secondary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button ${variant} ${className}`} {...props}>{children}</button>
}
function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string; disabled?: boolean }) {
  return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>
}
function EmptyProjects({ t, onOpen }: { t: Messages; onOpen: () => void }) {
  return <div className="empty-projects"><div className="empty-icon"><FolderOpen size={25} /></div><div><strong>{t.emptyProjects}</strong><p>{t.emptyProjectsDescription}</p></div><Button onClick={onOpen}><Plus size={16} />{t.openProject}</Button></div>
}
function ProjectRow({ project, t, onOpen, onForget }: { project: RecentWorkspace; t: Messages; onOpen: () => void; onForget?: () => void }) {
  return <div className="project-row"><button className="project-main" onClick={onOpen}><span className="project-icon"><Folder size={19} /></span><span className="project-copy"><strong>{project.name}</strong><span title={project.path}>{project.path}</span></span><ArrowRight size={17} className="project-arrow" /></button>{onForget && <button className="icon-button subtle" aria-label={`${t.forget}: ${project.name}`} title={t.forgetHint} onClick={onForget}><Trash2 size={16} /></button>}</div>
}
function ActionCard({ icon, title, description, onClick, accent }: { icon: React.ReactNode; title: string; description: string; onClick: () => void; accent: string }) {
  return <button className="action-card" onClick={onClick}><span className={`action-icon ${accent}`}>{icon}</span><span className="action-card-copy"><strong>{title}</strong><span>{description}</span></span><ArrowUpRightIcon /></button>
}
function ArrowUpRightIcon() { return <ArrowDownLeft className="action-arrow" size={18} /> }

function CommandPalette({ t, onClose, actions }: { t: Messages; onClose: () => void; actions: { id: string; label: string; icon: React.ReactNode; run: () => void; shortcut?: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const filtered = actions.filter(action => action.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const activeId = filtered[active]?.id
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.showModal()
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [])
  const choose = (index: number): void => { const action = filtered[index]; if (action) { onClose(); action.run() } }
  return <dialog ref={dialog} className="palette" aria-label={t.palette} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="palette-search"><Search size={20} /><input role="combobox" aria-expanded="true" aria-controls="palette-actions" aria-autocomplete="list" aria-activedescendant={activeId ? `palette-action-${activeId}` : undefined} autoFocus value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} placeholder={t.palettePlaceholder} aria-label={t.palette} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, filtered.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)) }
      if (event.key === 'Enter') { event.preventDefault(); choose(active) }
    }} /><kbd>Esc</kbd></div>
    <div className="palette-label">{t.actions}</div>
    <div id="palette-actions" className="palette-list" role="listbox" aria-label={t.actions}>{filtered.map((action, index) => <div key={action.id} id={`palette-action-${action.id}`} role="option" aria-selected={index === active} className={`palette-item ${index === active ? 'active' : ''}`} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>{action.icon}<span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</div>)}</div>{filtered.length === 0 && <p className="palette-empty">{t.noMatches}</p>}
    <div className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> {t.navigate}</span><span><kbd>↵</kbd> {t.select}</span><span><kbd>Esc</kbd> {t.close}</span></div>
  </dialog>
}

function WorkspaceDialog({ t, onClose, onSubmit }: { t: Messages; onClose: () => void; onSubmit: (path: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [path, setPath] = useState('/home/user/DSH_F/.preview/workspaces/proyecto-demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.showModal()
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [])
  return <dialog ref={dialog} className="workspace-dialog" aria-label={t.previewProject} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSubmit(path); onClose() } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) } }}>
    <div className="dialog-heading"><span className="action-icon blue"><FolderOpen size={22} /></span><button type="button" className="icon-button" aria-label={t.close} onClick={onClose}><X size={19} /></button></div>
    <h2>{t.previewProject}</h2><p>{t.previewProjectDescription}</p><label htmlFor="workspace-path">{t.path}</label><input id="workspace-path" value={path} onChange={event => setPath(event.target.value)} required autoFocus />
    {error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><Button type="button" onClick={onClose}>{t.cancel}</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{t.add}</Button></div>
  </form></dialog>
}

function OnboardingCard({ t, statusText, phase, busy, onOpenProject, onConfigureModel, onDiagnostics, onDismiss }: { t: Messages; statusText: string; phase: EngineStatus['phase']; busy: boolean; onOpenProject: () => void; onConfigureModel: () => void; onDiagnostics: () => void; onDismiss: () => void }) {
  return <section className="onboarding-card" aria-labelledby="onboarding-title">
    <div className="onboarding-heading"><div><h2 id="onboarding-title">{t.onboardingTitle}</h2><p>{t.onboardingDescription}</p></div><Button variant="ghost" onClick={onDismiss} disabled={busy}>{t.onboardingDismiss}</Button></div>
    <ol className="onboarding-steps">
      <li><span className="action-icon blue"><Cpu size={20} /></span><div><strong>{t.onboardingStepEngine}</strong><p>{t.onboardingStepEngineDescription}</p><span className="status-pill"><StatusDot phase={phase} />{statusText}</span><Button variant="ghost" onClick={onDiagnostics}>{t.onboardingOpenDiagnostics}</Button></div></li>
      <li><span className="action-icon violet"><FolderOpen size={20} /></span><div><strong>{t.onboardingStepProject}</strong><p>{t.onboardingStepProjectDescription}</p><Button onClick={onOpenProject} disabled={busy}><FolderOpen size={15} />{t.openProject}</Button></div></li>
      <li><span className="action-icon green"><PlugZap size={20} /></span><div><strong>{t.onboardingStepModel}</strong><p>{t.onboardingStepModelDescription}</p><Button onClick={onConfigureModel}>{t.onboardingConfigureModel}</Button></div></li>
      <li><span className="action-icon blue"><ShieldCheck size={20} /></span><div><strong>{t.onboardingStepPermissions}</strong><p>{t.onboardingStepPermissionsDescription}</p></div></li>
    </ol>
  </section>
}

function EngineRecovery({ t, status, busy, onRestart, onExport }: { t: Messages; status: EngineStatus; busy: boolean; onRestart: () => void; onExport: () => void }) {
  return <section className="settings-card recovery-card" aria-labelledby="engine-recovery-title">
    <div className="settings-card-heading"><span className={`action-icon ${status.phase === 'error' ? 'violet' : 'green'}`}><Cpu size={20} /></span><div><h2 id="engine-recovery-title">{t.engineRecoveryTitle}</h2><p>{t.engineRecoveryDescription}</p></div></div>
    <div className="diagnostic-grid recovery-grid">
      <div className="diagnostic-tile"><span>{t.engine}</span><strong>{t[status.phase]}</strong></div>
      <div className="diagnostic-tile"><span>{t.engineAttempts}</span><strong>{status.attempts}</strong></div>
      <div className="diagnostic-tile"><span>{t.engineLastMessage}</span><strong>{status.message || t.engineNoError}</strong></div>
    </div>
    <div className="toolbar-buttons"><Button onClick={onRestart} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} />{t.restart}</Button><Button onClick={onExport} disabled={busy}><Download size={15} />{t.export}</Button></div>
  </section>
}

export function App() {
  const [view, setView] = useState<View>('home')
  const [state, setState] = useState<DesktopState>({ settings: DEFAULT_SETTINGS, recent: [] })
  const [status, setStatus] = useState<EngineStatus>(initialStatus)
  const [loaded, setLoaded] = useState(false)
  const [fatal, setFatal] = useState('')
  const [palette, setPalette] = useState(false)
  const [workspaceDialog, setWorkspaceDialog] = useState(false)
  const [workspaceResolver, setWorkspaceResolver] = useState<((value: RecentWorkspace | null) => void) | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState('')
  const [logFilter, setLogFilter] = useState('')
  const [logLevel, setLogLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all')
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [updates, setUpdates] = useState<UpdateCheck | null>(null)
  const [frameSrc, setFrameSrc] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const frameAttempt = useRef(-1)
  const toastId = useRef(0)
  const t: Messages = messages[state.settings.language]
  const statusText = t[status.phase]

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = ++toastId.current
    setToasts(items => [...items.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 4500)
  }, [])
  const perform = useCallback(async (key: string, task: () => Promise<unknown>, success?: string) => {
    setBusy(key)
    try { const result = await task(); if (success) toast(success); return result } catch (error) { toast(`${t.operationFailed}: ${errorMessage(error)}`, 'error'); return undefined } finally { setBusy('') }
  }, [t.operationFailed, toast])

  useEffect(() => {
    let alive = true
    void Promise.all([api.getState(), api.getEngineStatus()]).then(([next, engine]) => { if (alive) { setState(next); setStatus(engine) } }).catch(error => { if (alive) setFatal(errorMessage(error)) }).finally(() => { if (alive) setLoaded(true) })
    const unsubscribe = api.subscribe(next => {
      if (!alive) return
      if (next.phase === 'ready' && !next.bridgeUrl) void api.getEngineStatus().then(fresh => { if (alive) setStatus(fresh) }).catch(() => { if (alive) setStatus(next) })
      else setStatus(next)
    })
    return () => { alive = false; unsubscribe() }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
    document.documentElement.dataset.reduceMotion = String(state.settings.reduceMotion)
    document.documentElement.lang = state.settings.language
  }, [state.settings])
  useEffect(() => {
    if (status.phase === 'ready' && status.bridgeUrl && frameAttempt.current !== status.attempts) {
      frameAttempt.current = status.attempts
      setFrameLoaded(false)
      setFrameSrc(status.bridgeUrl)
    }
  }, [status.phase, status.bridgeUrl, status.attempts])
  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<{ resolve: (value: RecentWorkspace | null) => void }>).detail
      setWorkspaceResolver(() => detail.resolve); setWorkspaceDialog(true)
    }
    window.addEventListener('dshf:pick-workspace', listener)
    return () => window.removeEventListener('dshf:pick-workspace', listener)
  }, [])
  useEffect(() => {
    if (view === 'diagnostics') void api.getDiagnostics().then(setDiagnostics).catch(error => toast(errorMessage(error), 'error'))
  }, [view, toast])
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(value => !value) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); void openProject() }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); setView('settings') }
      if (event.altKey && event.key === '1') setView('home')
      if (event.altKey && event.key === '2') setView('agent')
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  })

  const openProject = async (): Promise<void> => {
    await perform('open', async () => {
      const project = await api.chooseWorkspace()
      if (project) { setState(await api.getState()); setView('agent'); toast(t.opened); toast(t.openAgentHint) }
    })
  }
  const openRecent = async (project: RecentWorkspace): Promise<void> => {
    await perform('open', async () => { await api.openWorkspace(project.path); setState(await api.getState()); setView('agent'); toast(t.opened); toast(t.openAgentHint) })
  }
  const updateSettings = async (patch: SettingsPatch): Promise<void> => {
    const next = await perform('settings', () => api.setSettings(patch), t.saved)
    if (next) setState(next as DesktopState)
  }
  const restart = async (): Promise<void> => { await perform('engine', () => api.restartEngine(), t.restarted) }
  const stop = async (): Promise<void> => { await perform('engine', () => api.stopEngine(), t.stoppedToast) }
  const exportDiagnostics = async (): Promise<void> => { await perform('export', () => api.exportDiagnostics(), t.exported) }
  const openAgent = (hint?: string): void => { setView('agent'); if (hint) toast(hint) }
  const filteredProjects = useMemo(() => state.recent.filter(project => `${project.name} ${project.path}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())), [state.recent, filter])
  const filteredLog = useMemo(() => {
    const query = logFilter.toLocaleLowerCase()
    return (diagnostics?.log ?? '').split('\n').filter(line => {
      if (!line) return false
      if (logLevel !== 'all' && !line.includes(`[${logLevel}]`)) return false
      return !query || line.toLocaleLowerCase().includes(query)
    }).join('\n')
  }, [diagnostics?.log, logFilter, logLevel])
  const copyLogs = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(filteredLog)
      toast(t.logsCopied)
    } catch { toast(t.operationFailed, 'error') }
  }
  const checkUpdates = async (): Promise<void> => {
    const result = await perform('updates', () => api.checkUpdates())
    if (result) setUpdates(result as UpdateCheck)
  }
  const actions = [
    { id: 'home', label: t.home, icon: <Home size={18} />, run: () => setView('home'), shortcut: 'Alt 1' },
    { id: 'agent', label: t.agent, icon: <Sparkles size={18} />, run: () => setView('agent'), shortcut: 'Alt 2' },
    { id: 'open', label: t.openProject, icon: <FolderOpen size={18} />, run: () => { void openProject() }, shortcut: 'Ctrl O' },
    { id: 'projects', label: t.projects, icon: <Folder size={18} />, run: () => setView('projects') },
    { id: 'settings', label: t.settings, icon: <Settings2 size={18} />, run: () => setView('settings'), shortcut: 'Ctrl ,' },
    { id: 'restart', label: t.restart, icon: <RefreshCw size={18} />, run: () => { void restart() } },
    { id: 'diagnostics', label: t.export, icon: <Download size={18} />, run: () => { void exportDiagnostics() } },
    { id: 'docs', label: t.documentation, icon: <BookOpen size={18} />, run: () => { void api.openExternal('documentation') } },
  ]
  const nav = [{ id: 'home', icon: Home, label: t.home }, { id: 'agent', icon: Sparkles, label: t.agent }, { id: 'projects', icon: Folder, label: t.projects }] as const

  if (fatal) return <main className="fatal-screen"><Brand /><h1>{t.errorTitle}</h1><p>{fatal}</p><Button variant="primary" onClick={() => location.reload()}>{t.retry}</Button></main>
  return <div className={`app-shell ${!loaded ? 'loading' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }) }}>{t.workspace}</a>
    <aside className="sidebar" aria-label={t.workspace}>
      <Brand />
      <button className="sidebar-search" onClick={() => setPalette(true)}><Search size={16} /><span>{t.search}</span><kbd>⌘ K</kbd></button>
      <nav className="primary-nav" aria-label={t.actions}>{nav.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-label={item.label} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}><item.icon size={19} /><span>{item.label}</span>{item.id === 'agent' && <span className={`nav-dot ${status.phase}`} />}</button>)}</nav>
      <div className="sidebar-section"><span>{t.recent}</span><button className="icon-button tiny" aria-label={t.openProject} onClick={() => { void openProject() }}><Plus size={15} /></button></div>
      <div className="sidebar-projects">{state.recent.slice(0, 4).map(project => <button key={project.path} onClick={() => { void openRecent(project) }} title={project.path}><Folder size={15} /><span>{project.name}</span></button>)}{state.recent.length === 0 && <p className="sidebar-empty">{t.emptyProjects}</p>}</div>
      <div className="sidebar-bottom"><div className="local-card"><ShieldCheck size={18} /><div><strong>{t.localOnly}</strong><span>{t.privacyDescription}</span></div></div><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} aria-label={t.settings} onClick={() => setView('settings')}><Settings2 size={18} /><span>{t.settings}</span></button><button className={`nav-item ${view === 'diagnostics' ? 'active' : ''}`} aria-label={t.diagnostics} onClick={() => setView('diagnostics')}><Activity size={18} /><span>{t.diagnostics}</span></button><div className="sidebar-version"><span className="fedora-mark">f</span><span>Fedora Edition</span><span>v0.1.0</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>{t.workspace}</span><ChevronRight size={14} /><strong>{view === 'home' ? t.home : view === 'agent' ? t.agent : view === 'projects' ? t.projects : view === 'settings' ? t.settings : t.diagnostics}</strong></div><div className="topbar-actions"><button className="status-pill" onClick={() => setView('diagnostics')}><StatusDot phase={status.phase} /><span>{statusText}</span></button><span className="topbar-divider" /><button className="icon-button" aria-label={t.documentation} onClick={() => { void api.openExternal('documentation') }}><CircleHelp size={19} /></button><button className="avatar" aria-label={`DS · ${t.settings}`} onClick={() => setView('settings')}>DS</button></div></header>
      {isPreview && <div className="preview-banner" role="region" aria-label={t.preview}><Monitor size={13} />{t.preview}</div>}
      <main id="main-content" className={`content view-${view}`} tabIndex={-1}>
        {view === 'home' && <div className="home-page">
          <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><div className="eyebrow"><span />{t.eyebrow}</div><h1 id="hero-title">{t.hero1}<br /><span>{t.hero2}</span></h1><p>{t.heroDescription}</p><div className="hero-actions"><Button variant="primary" onClick={() => { void openProject() }} disabled={!!busy}><FolderOpen size={17} />{t.openProject}<ArrowRight size={16} /></Button><Button variant="ghost" onClick={() => openAgent(t.openAgentHint)}><Plus size={17} />{t.newWorkspace}</Button></div><div className="hero-footnote"><ShieldCheck size={14} />{t.privacyDescription}</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="art-glow" /><div className="core-mark"><img src="./assets/icon.svg" alt="" /></div><div className="floating-chip chip-code"><Code2 size={19} /><span>{t.codeTitle}</span><span className="chip-dot" /></div><div className="floating-chip chip-terminal"><Terminal size={18} /><span>Terminal</span></div><div className="floating-chip chip-files"><Layers3 size={18} /><span>{t.projects}</span></div><div className="art-node node-one" /><div className="art-node node-two" /><div className="art-node node-three" /></div></section>
          {!state.settings.onboardingDismissed && <OnboardingCard t={t} statusText={statusText} phase={status.phase} busy={!!busy} onOpenProject={() => { void openProject() }} onConfigureModel={() => openAgent(t.configureModelHint)} onDiagnostics={() => setView('diagnostics')} onDismiss={() => { void updateSettings({ onboardingDismissed: true }) }} />}
          <section className="quick-section" aria-labelledby="quick-title"><div className="section-heading"><div><h2 id="quick-title">{t.startYourWay}</h2><p>{t.startDescription}</p></div><span className="keyboard-hint"><kbd>Ctrl</kbd><kbd>K</kbd> {t.shortcutHint}</span></div><div className="action-grid"><ActionCard icon={<Code2 size={23} />} title={t.codeTitle} description={t.codeDescription} accent="blue" onClick={() => { void openProject() }} /><ActionCard icon={<Sparkles size={23} />} title={t.createTitle} description={t.createDescription} accent="violet" onClick={() => openAgent(t.openAgentHint)} /><ActionCard icon={<PlugZap size={23} />} title={t.connectTitle} description={t.connectDescription} accent="green" onClick={() => openAgent(t.configureModelHint)} /></div></section>
          <section className="recent-section" aria-labelledby="recent-title"><div className="section-heading"><div><h2 id="recent-title">{t.recent}</h2><p>{t.recentDescription}</p></div><button className="text-button" onClick={() => setView('projects')}>{t.seeAll}<ArrowRight size={15} /></button></div>{state.recent.length ? <div className="project-list">{state.recent.slice(0, 3).map(project => <ProjectRow key={project.path} project={project} t={t} onOpen={() => { void openRecent(project) }} />)}</div> : <EmptyProjects t={t} onOpen={() => { void openProject() }} />}</section>
          <footer className="home-footer"><span><ShieldCheck size={15} />{t.privacy}</span><span><Cpu size={15} />{t.official} {UPSTREAM_VERSION}</span><span><Monitor size={15} />{t.plasma}</span></footer>
        </div>}
        <div className="agent-view" hidden={view !== 'agent'}><div className="agent-toolbar"><div><h2>{t.agent}</h2><p>{t.agentDescription}</p></div><div className="toolbar-buttons"><Button variant="ghost" onClick={() => setView('home')}><Home size={15} />{t.backHome}</Button><Button onClick={() => { void restart() }} disabled={!!busy}><RefreshCw size={15} className={busy === 'engine' ? 'spin' : ''} />{t.restart}</Button></div></div><div className="engine-surface">
          {status.phase !== 'ready' && <div className="engine-placeholder"><div className={`engine-state-icon ${status.phase}`}>{status.phase === 'error' ? <Zap size={30} /> : status.phase === 'stopped' ? <Square size={27} /> : <LoaderCircle size={32} className="spin" />}</div><h2>{status.phase === 'error' ? t.errorTitle : status.phase === 'stopped' ? t.stopped : t.loadingTitle}</h2><p>{status.phase === 'error' ? status.message || t.errorDescription : status.phase === 'stopped' ? t.engineDescription : t.loadingDescription}</p><div className="hero-actions"><Button variant="primary" onClick={() => { void restart() }} disabled={!!busy}><RefreshCw size={16} />{status.phase === 'error' ? t.retry : t.restart}</Button><Button onClick={() => setView('diagnostics')}><Activity size={16} />{t.diagnostics}</Button></div></div>}
          {frameSrc && <iframe title={t.agent} src={frameSrc} className={`harness-frame ${status.phase === 'ready' && frameLoaded ? 'visible' : ''}`} onLoad={() => setFrameLoaded(true)} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads" allow="clipboard-read; clipboard-write" />}
        </div><div className="agent-statusbar"><span><StatusDot phase={status.phase} />{statusText}</span><span><ShieldCheck size={13} />{t.permissions}</span><span>Harness {UPSTREAM_VERSION}</span></div></div>
        {view === 'projects' && <div className="page projects-page"><div className="page-heading"><div><div className="eyebrow">{t.workspace}</div><h1>{t.projects}</h1><p>{t.projectsDescription}</p></div><Button variant="primary" onClick={() => { void openProject() }} disabled={!!busy}><Plus size={17} />{t.openProject}</Button></div><div className="project-filter"><Search size={17} /><input aria-label={t.filterProjects} placeholder={t.filterProjects} value={filter} onChange={event => setFilter(event.target.value)} /></div>{filteredProjects.length ? <div className="project-list full">{filteredProjects.map(project => <ProjectRow key={project.path} project={project} t={t} onOpen={() => { void openRecent(project) }} onForget={() => { void perform('forget', async () => { setState(await api.forgetWorkspace(project.path)) }, t.forgotten) }} />)}</div> : <EmptyProjects t={t} onOpen={() => { void openProject() }} />}<div className="info-note"><ShieldCheck size={18} /><p>{t.forgetHint}</p></div></div>}
        {view === 'settings' && <div className="page settings-page"><div className="page-heading"><div><div className="eyebrow">{t.workspace}</div><h1>{t.settings}</h1><p>{t.appearanceDescription}</p></div></div><section className="settings-card"><div className="settings-card-heading"><span className="action-icon blue"><Sun size={20} /></span><div><h2>{t.appearance}</h2><p>{t.appearanceDescription}</p></div></div><div className="setting-row"><div><strong>{t.theme}</strong><p>{t.appearanceDescription}</p></div><div className="segmented" role="group" aria-label={t.theme}>{([{ value: 'system', icon: Monitor, label: t.system }, { value: 'dark', icon: Moon, label: t.dark }, { value: 'light', icon: Sun, label: t.light }] as const).map(option => <button key={option.value} aria-pressed={state.settings.theme === option.value} className={state.settings.theme === option.value ? 'selected' : ''} onClick={() => { void updateSettings({ theme: option.value }) }} disabled={!!busy}><option.icon size={15} />{option.label}</button>)}</div></div><div className="setting-row"><div><strong>{t.language}</strong><p>Español · English</p></div><select aria-label={t.language} value={state.settings.language} onChange={event => { void updateSettings({ language: event.target.value as Settings['language'] }) }} disabled={!!busy}><option value="es">Español</option><option value="en">English</option></select></div><Toggle label={t.motion} description={t.motionDescription} checked={state.settings.reduceMotion} onChange={value => { void updateSettings({ reduceMotion: value }) }} disabled={!!busy} /><div className="setting-row"><div><strong>{t.onboardingTitle}</strong><p>{t.onboardingDescription}</p></div><Button onClick={() => { void updateSettings({ onboardingDismissed: false }).then(() => setView('home')) }} disabled={!!busy}>{t.onboardingReopen}</Button></div></section>
          <section className="settings-card"><div className="settings-card-heading"><span className="action-icon violet"><Monitor size={20} /></span><div><h2>{t.behavior}</h2><p>{t.behaviorDescription}</p></div></div><Toggle label={t.tray} description={t.trayDescription} checked={state.settings.closeToTray} onChange={value => { void updateSettings({ closeToTray: value }) }} disabled={!!busy || isPreview} /><Toggle label={t.confirm} description={t.confirmDescription} checked={state.settings.confirmQuit} onChange={value => { void updateSettings({ confirmQuit: value }) }} disabled={!!busy || isPreview} /><Toggle label={t.autostart} description={t.autostartDescription} checked={state.settings.launchOnLogin} onChange={value => { void updateSettings({ launchOnLogin: value }) }} disabled={!!busy || isPreview} /><Toggle label={t.notifications} description={t.notificationsDescription} checked={state.settings.notificationsEnabled} onChange={value => { void updateSettings({ notificationsEnabled: value }) }} disabled={!!busy} /></section>
          <section className="settings-card updates-card" aria-labelledby="updates-title"><div className="settings-card-heading"><span className="action-icon blue"><RefreshCw size={20} /></span><div><h2 id="updates-title">{t.updates}</h2><p>{t.updatesDescription}</p></div></div><div className="setting-row"><div><strong>{t.checkUpdates}</strong><p>{t.updateManualHint}</p></div><Button onClick={() => { void checkUpdates() }} disabled={!!busy}><RefreshCw size={15} className={busy === 'updates' ? 'spin' : ''} />{busy === 'updates' ? t.checkingUpdates : t.checkUpdates}</Button></div>{updates && <div className="update-results" aria-live="polite">{updates.components.map(component => <div className="diagnostic-tile update-result" key={component.id}><span>{component.id === 'app' ? t.updateApp : t.updateEngine}</span><strong>{component.available ? `${t.updateAvailable}: ${component.available}` : t.upToDate}</strong><p>{t.updateCurrent}: {component.current}</p>{component.tags && <p>{t.updateTags}: {Object.entries(component.tags).map(([key, value]) => `${key}=${value}`).join(', ')}</p>}{component.error && <p className="form-error">{t.updateError}: {component.error}</p>}<p>{t.updateCheckedAt}: {new Date(component.checkedAt).toLocaleString()} · {t.updateSource}: {component.source}</p></div>)}</div>}</section>
          <section className="settings-card"><div className="settings-card-heading"><span className="action-icon green"><Cpu size={20} /></span><div><h2>{t.engine}</h2><p>{t.engineDescription}</p></div></div><div className="engine-settings"><div><StatusDot phase={status.phase} /><strong>{statusText}</strong><span>Harness {UPSTREAM_VERSION} · Node {UPSTREAM_NODE_VERSION.split('.')[0]}</span></div><div className="toolbar-buttons"><Button onClick={() => { void stop() }} disabled={!!busy || status.phase === 'stopped'}><Square size={14} />{t.stop}</Button><Button onClick={() => { void restart() }} disabled={!!busy}><RefreshCw size={15} />{t.restart}</Button></div></div><div className="info-note"><ShieldCheck size={18} /><p>{t.permissionsDescription}</p></div></section></div>}
        {view === 'diagnostics' && <div className="page diagnostics-page"><div className="page-heading"><div><div className="eyebrow">{t.workspace}</div><h1>{t.diagnostics}</h1><p>{t.logsDescription}</p></div><div className="toolbar-buttons"><Button onClick={() => { void api.getDiagnostics().then(setDiagnostics).catch(error => toast(errorMessage(error), 'error')) }}><RefreshCw size={15} />{t.refresh}</Button><Button variant="primary" onClick={() => { void exportDiagnostics() }} disabled={!!busy}><Download size={16} />{t.export}</Button></div></div><EngineRecovery t={t} status={status} busy={!!busy} onRestart={() => { void restart() }} onExport={() => { void exportDiagnostics() }} /><div className="diagnostic-grid">{[{ label: t.version, value: `0.1.0 · Harness ${UPSTREAM_VERSION}` }, { label: t.platform, value: diagnostics?.platform ?? '…' }, { label: t.session, value: diagnostics?.sessionType ?? '…' }, { label: t.architecture, value: diagnostics?.arch ?? '…' }, { label: 'Electron', value: diagnostics?.electron ?? '…' }, { label: t.engine, value: statusText }].map(item => <div className="diagnostic-tile" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div><section className="log-panel"><div className="log-heading"><Terminal size={17} /><h2>{t.logs}</h2><span className="status-pill"><StatusDot phase={status.phase} />{statusText}</span></div><div className="log-controls"><div className="project-filter"><Search size={16} /><input aria-label={t.logFilter} placeholder={t.logFilterPlaceholder} value={logFilter} onChange={event => setLogFilter(event.target.value)} /></div><select aria-label={t.logLevel} value={logLevel} onChange={event => setLogLevel(event.target.value as typeof logLevel)}><option value="all">{t.logLevelAll}</option><option value="info">{t.logLevelInfo}</option><option value="warn">{t.logLevelWarn}</option><option value="error">{t.logLevelError}</option></select><Button onClick={() => { void copyLogs() }} disabled={!filteredLog}><Copy size={15} />{t.copyLogs}</Button></div><pre role="region" tabIndex={0} aria-label={t.logs}>{filteredLog || (diagnostics?.log ? t.noLogMatches : t.noLogs)}</pre></section><div className="info-note"><ShieldCheck size={18} /><p>{t.logsDescription}</p></div></div>}
      </main>
    </div>
    {palette && <CommandPalette t={t} onClose={() => setPalette(false)} actions={actions} />}
    {workspaceDialog && <WorkspaceDialog t={t} onClose={() => { setWorkspaceDialog(false); workspaceResolver?.(null); setWorkspaceResolver(null) }} onSubmit={async path => { const project = await api.openWorkspace(path); setState(await api.getState()); setView('agent'); workspaceResolver?.(project); setWorkspaceResolver(null); toast(t.opened); toast(t.openAgentHint) }} />}
    <div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(item => <div key={item.id} className={`toast ${item.kind}`}>{item.kind === 'success' ? <Check size={17} /> : <X size={17} />}<span>{item.text}</span><button aria-label={t.close} onClick={() => setToasts(items => items.filter(value => value.id !== item.id))}><X size={14} /></button></div>)}</div>
  </div>
}
