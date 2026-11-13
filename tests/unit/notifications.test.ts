import { describe, expect, it } from 'vitest'
import { notificationForStatus } from '../../src/main/notifications.js'
import type { EngineStatus } from '../../src/shared/contracts.js'

const status = (phase: EngineStatus['phase'], message = 'detalle privado /home/user token=abc'): EngineStatus => ({ phase, message, attempts: 1, version: '0.2.2-rc.2' })

describe('notificaciones nativas opcionales', () => {
  it('avisa solo en transiciones a listo/error y nunca filtra el mensaje del motor', () => {
    const ready = notificationForStatus(status('starting'), status('ready'), true)
    const error = notificationForStatus(status('ready'), status('error'), true)
    expect(ready?.title).toContain('listo')
    expect(error?.title).toContain('atención')
    for (const notice of [ready, error]) {
      expect(notice?.body).not.toContain('/home/user')
      expect(notice?.body).not.toContain('token=')
      expect(notice?.body).not.toContain('detalle privado')
    }
  })
  it('se puede silenciar y no repite el mismo estado', () => {
    expect(notificationForStatus(status('starting'), status('ready'), false)).toBeNull()
    expect(notificationForStatus(status('ready'), status('ready'), true)).toBeNull()
    expect(notificationForStatus(status('error'), status('error'), true)).toBeNull()
    expect(notificationForStatus(undefined, status('starting'), true)).toBeNull()
  })
})
