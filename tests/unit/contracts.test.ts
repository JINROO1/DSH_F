import { describe, expect, it } from 'vitest'
import { commandSchema, desktopStateSchema, errorMessage, settingsPatchSchema, settingsSchema, workspaceSchema } from '../../src/shared/contracts.js'

describe('shared contracts', () => {
  it('applies safe defaults and rejects unknown settings', () => {
    expect(settingsSchema.parse({}).language).toBe('es')
    expect(() => settingsSchema.parse({ unknown: true })).toThrow()
    expect(settingsPatchSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
  })
  it('validates every native command shape', () => {
    const valid = [
      { channel: 'state:get' },
      { channel: 'engine:status' },
      { channel: 'settings:set', payload: { theme: 'light' } },
      { channel: 'workspace:choose' },
      { channel: 'workspace:open', payload: { path: '/tmp/proyecto' } },
      { channel: 'workspace:forget', payload: { path: '/tmp/proyecto' } },
      { channel: 'engine:restart' },
      { channel: 'engine:stop' },
      { channel: 'diagnostics:get' },
      { channel: 'diagnostics:export' },
      { channel: 'external:open', payload: { destination: 'documentation' } },
      { channel: 'window:action', payload: { action: 'close' } },
    ]
    for (const command of valid) expect(commandSchema.parse(command)).toEqual(command)
  })
  it('rejects arbitrary channels, extra fields, URLs and paths', () => {
    for (const command of [
      { channel: 'shell:exec', payload: 'rm -rf' },
      { channel: 'state:get', extra: true },
      { channel: 'external:open', payload: { destination: 'https://evil.example' } },
      { channel: 'window:action', payload: { action: 'destroy' } },
      { channel: 'workspace:open', payload: { path: '' } },
      { channel: 'settings:set', payload: { theme: 'neon' } },
    ]) expect(commandSchema.safeParse(command).success).toBe(false)
  })
  it('bounds workspace history and validates timestamps', () => {
    expect(workspaceSchema.safeParse({ path: 'relativo', name: 'x', lastOpened: new Date().toISOString() }).success).toBe(false)
    expect(workspaceSchema.safeParse({ path: '/tmp/x', name: 'x', lastOpened: 'ayer' }).success).toBe(false)
    expect(desktopStateSchema.safeParse({ settings: {}, recent: Array.from({ length: 21 }, () => ({ path: '/tmp/x', name: 'x', lastOpened: new Date().toISOString() })) }).success).toBe(false)
  })
  it('normalizes unknown errors', () => {
    expect(errorMessage(new Error('fallo'))).toBe('fallo')
    expect(errorMessage('texto')).toBe('texto')
    expect(errorMessage(null)).toBe('null')
  })
})
