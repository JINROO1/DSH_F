import type { EngineStatus } from '../shared/contracts.js'

export interface DesktopNotification { title: string; body: string }

/** Generic, secret-free native notices. The caller decides whether the platform supports them. */
export function notificationForStatus(previous: EngineStatus | undefined, next: EngineStatus, enabled: boolean): DesktopNotification | null {
  if (!enabled) return null
  if (next.phase === 'ready' && previous?.phase !== 'ready') {
    return { title: 'DeepSeek Harness listo', body: 'El motor local está disponible.' }
  }
  if (next.phase === 'error' && previous?.phase !== 'error') {
    return { title: 'Harness necesita atención', body: 'Abre Diagnóstico para ver el detalle y reintentar.' }
  }
  return null
}
