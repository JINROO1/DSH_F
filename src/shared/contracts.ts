import { z } from 'zod'
import upstream from '../../runtime/upstream.json'

export const APP_ID = 'io.github.jinroo1.dshfedora'
export const UPSTREAM_VERSION: string = upstream.version
export const UPSTREAM_NODE_VERSION: string = upstream.nodeVersion
export const UPSTREAM_COMMIT: string | null = upstream.sourceCommit
export const APP_ORIGIN = 'dshf://app'
export const EXTERNAL_LINKS = {
  documentation: 'https://github.com/deepseek-ai/deepseek-harness',
  source: 'https://github.com/JINROO1/DSH_F',
  privacy: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md',
} as const

export const settingsSchema = z.object({
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  language: z.enum(['es', 'en']).default('es'),
  closeToTray: z.boolean().default(true),
  confirmQuit: z.boolean().default(true),
  launchOnLogin: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
  onboardingDismissed: z.boolean().default(false),
  notificationsEnabled: z.boolean().default(true),
}).strict()
export type Settings = z.infer<typeof settingsSchema>
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({})
export const settingsPatchSchema = z.object({
  theme: z.enum(['system', 'dark', 'light']).optional(),
  language: z.enum(['es', 'en']).optional(),
  closeToTray: z.boolean().optional(),
  confirmQuit: z.boolean().optional(),
  launchOnLogin: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  onboardingDismissed: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
}).strict()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const workspaceSchema = z.object({
  path: z.string().min(1).max(4096).refine(value => value.startsWith('/') && !value.includes('\0') && !value.includes('\n'), 'Ruta absoluta requerida'),
  name: z.string().min(1).max(120),
  lastOpened: z.string().datetime(),
})
export type RecentWorkspace = z.infer<typeof workspaceSchema>
export const desktopStateSchema = z.object({
  settings: settingsSchema,
  recent: z.array(workspaceSchema).max(20),
})
export type DesktopState = z.infer<typeof desktopStateSchema>

export type EnginePhase = 'stopped' | 'starting' | 'ready' | 'stopping' | 'error'
export interface EngineStatus {
  phase: EnginePhase
  message: string
  attempts: number
  version: string
  bridgeUrl?: string
}
export interface ReadyBridge {
  /** A one-use, short-lived bootstrap URL. Never contains the upstream token or cookie. */
  url: string
  origin: string
}
export interface Diagnostics {
  appVersion: string
  upstreamVersion: string
  platform: string
  arch: string
  electron: string
  node: string
  chrome: string
  sessionType: string
  engine: EngineStatus
  log: string
}

export const commandSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('state:get') }).strict(),
  z.object({ channel: z.literal('settings:set'), payload: settingsPatchSchema }).strict(),
  z.object({ channel: z.literal('workspace:choose') }).strict(),
  z.object({ channel: z.literal('workspace:open'), payload: z.object({ path: z.string().min(1).max(4096) }).strict() }).strict(),
  z.object({ channel: z.literal('workspace:forget'), payload: z.object({ path: z.string().min(1).max(4096) }).strict() }).strict(),
  z.object({ channel: z.literal('engine:status') }).strict(),
  z.object({ channel: z.literal('engine:restart') }).strict(),
  z.object({ channel: z.literal('engine:stop') }).strict(),
  z.object({ channel: z.literal('diagnostics:get') }).strict(),
  z.object({ channel: z.literal('diagnostics:export') }).strict(),
  z.object({ channel: z.literal('updates:check') }).strict(),
  z.object({ channel: z.literal('external:open'), payload: z.object({ destination: z.enum(['documentation', 'source', 'privacy']) }).strict() }).strict(),
  z.object({ channel: z.literal('window:action'), payload: z.object({ action: z.enum(['minimize', 'maximize', 'close']) }).strict() }).strict(),
])
export type Command = z.infer<typeof commandSchema>
export type CommandChannel = Command['channel']

export const updateComponentSchema = z.object({
  id: z.enum(['app', 'engine']),
  current: z.string().min(1),
  available: z.string().min(1).nullable(),
  checkedAt: z.string().datetime(),
  source: z.string().url(),
  error: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
}).strict()
export const updateCheckSchema = z.object({
  checkedAt: z.string().datetime(),
  components: z.array(updateComponentSchema).length(2),
}).strict()
export type UpdateComponent = z.infer<typeof updateComponentSchema>
export type UpdateCheck = z.infer<typeof updateCheckSchema>

/** The only browser-visible native surface. No arbitrary paths, shell commands or URL openings. */
export interface DesktopApi {
  getState(): Promise<DesktopState>
  setSettings(patch: SettingsPatch): Promise<DesktopState>
  chooseWorkspace(): Promise<RecentWorkspace | null>
  openWorkspace(path: string): Promise<RecentWorkspace>
  forgetWorkspace(path: string): Promise<DesktopState>
  getEngineStatus(): Promise<EngineStatus>
  restartEngine(): Promise<EngineStatus>
  stopEngine(): Promise<EngineStatus>
  getDiagnostics(): Promise<Diagnostics>
  exportDiagnostics(): Promise<string | null>
  checkUpdates(): Promise<UpdateCheck>
  openExternal(destination: keyof typeof EXTERNAL_LINKS): Promise<void>
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>
  subscribe(callback: (status: EngineStatus) => void): () => void
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
