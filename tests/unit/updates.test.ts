import { describe, expect, it } from 'vitest'
import { checkForUpdates, compareExactVersions } from '../../src/main/updates.js'
import { updateCheckSchema } from '../../src/shared/contracts.js'

function fetchWith(routes: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))?.[1]
    if (!route) throw new Error(`URL no permitida en test: ${url}`)
    return route()
  }) as typeof fetch
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

describe('comprobación manual de actualizaciones', () => {
  it('compara versiones exactas con precedencia semver de prerelease', () => {
    expect(compareExactVersions('0.2.2-rc.2', '0.2.2-rc.1')).toBe(1)
    expect(compareExactVersions('0.2.2-rc.2', '0.2.2')).toBe(-1)
    expect(compareExactVersions('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1)
    expect(compareExactVersions('1.0.0-2', '1.0.0-alpha')).toBe(-1)
    expect(compareExactVersions('1.2.3', '1.2.3')).toBe(0)
    expect(() => compareExactVersions('latest', '1.0.0')).toThrow()
  })

  it('reporta versiones exactas más nuevas sin confiar ciegamente en latest', async () => {
    const result = updateCheckSchema.parse(await checkForUpdates({
      appVersion: '0.1.0', upstreamVersion: '0.2.2-rc.2',
      fetchImpl: fetchWith({
        'https://api.github.com/': () => json({ tag_name: 'v0.2.0' }),
        'https://registry.npmjs.org/': () => json({ 'dist-tags': { latest: '0.2.2-rc.1', next: '0.2.3-rc.1' } }),
      }),
    }))
    expect(result.components[0]?.available).toBe('0.2.0')
    expect(result.components[1]?.available).toBe('0.2.3-rc.1')
    expect(result.components[1]?.tags).toEqual({ latest: '0.2.2-rc.1', next: '0.2.3-rc.1' })
    expect(result.components.every(component => component.source.startsWith('https://'))).toBe(true)
  })

  it('no inventa actualización cuando los tags publicados son iguales o menores', async () => {
    const result = await checkForUpdates({
      appVersion: '0.1.0', upstreamVersion: '0.2.2-rc.2',
      fetchImpl: fetchWith({
        'https://api.github.com/': () => json({ tag_name: 'v0.1.0' }),
        'https://registry.npmjs.org/': () => json({ 'dist-tags': { latest: '0.2.2-rc.1', next: '0.2.2-rc.2' } }),
      }),
    })
    expect(result.components.map(component => component.available)).toEqual([null, null])
  })

  it('convierte 404, JSON inválido y tags no válidos en errores controlados', async () => {
    const result = await checkForUpdates({
      appVersion: '0.1.0', upstreamVersion: '0.2.2-rc.2',
      fetchImpl: fetchWith({
        'https://api.github.com/': () => new Response('no', { status: 404 }),
        'https://registry.npmjs.org/': () => new Response('{roto', { status: 200 }),
      }),
    })
    expect(result.components[0]?.error).toContain('404')
    expect(result.components[1]?.error).toBeTruthy()
    expect(result.components.every(component => component.available === null)).toBe(true)

    const invalidTag = await checkForUpdates({
      appVersion: '0.1.0', upstreamVersion: '0.2.2-rc.2',
      fetchImpl: fetchWith({
        'https://api.github.com/': () => json({ tag_name: 'latest' }),
        'https://registry.npmjs.org/': () => json({ 'dist-tags': { latest: 'también-roto' } }),
      }),
    })
    expect(invalidTag.components[0]?.error).toBeTruthy()
    expect(invalidTag.components[1]?.available).toBeNull()
  })

  it('los fallos de red/timeout no rompen la comprobación ni exponen tokens', async () => {
    const result = await checkForUpdates({
      appVersion: '0.1.0', upstreamVersion: '0.2.2-rc.2', timeoutMs: 1,
      fetchImpl: (async () => { throw new Error('The operation was aborted due to timeout') }) as typeof fetch,
    })
    expect(result.components).toHaveLength(2)
    for (const component of result.components) {
      expect(component.available).toBeNull()
      expect(component.error).toContain('timeout')
      expect(component.error).not.toMatch(/token=/)
    }
  })
})
