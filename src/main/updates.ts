import { z } from 'zod'
import { errorMessage, type UpdateCheck, type UpdateComponent } from '../shared/contracts.js'

export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const APP_RELEASE_API = 'https://api.github.com/repos/JINROO1/DSH_F/releases/latest'
const APP_RELEASES_URL = 'https://github.com/JINROO1/DSH_F/releases'
const ENGINE_REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh'
const ENGINE_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh'

/** Exact semver precedence for the versions this project pins (no ranges/build metadata). */
export function compareExactVersions(a: string, b: string): number {
  if (!EXACT_VERSION.test(a) || !EXACT_VERSION.test(b)) throw new Error('Versión exacta no válida')
  const parse = (value: string) => {
    const [core, pre = ''] = value.split('-', 2)
    const numbers = core!.split('.').map(Number)
    return { numbers, pre: pre ? pre.split('.') : [] }
  }
  const left = parse(a), right = parse(b)
  for (let index = 0; index < 3; index++) {
    const diff = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index++) {
    const l = left.pre[index], r = right.pre[index]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (l === r) continue
    const lNum = /^\d+$/u.test(l), rNum = /^\d+$/u.test(r)
    if (lNum && rNum) return Number(l) < Number(r) ? -1 : 1
    if (lNum) return -1
    if (rNum) return 1
    return l < r ? -1 : 1
  }
  return 0
}

function newerCandidate(current: string, candidates: readonly (string | undefined)[]): string | null {
  let best: string | null = null
  for (const candidate of candidates) {
    if (!candidate || !EXACT_VERSION.test(candidate)) continue
    if (compareExactVersions(candidate, current) <= 0) continue
    if (!best || compareExactVersions(candidate, best) > 0) best = candidate
  }
  return best
}

async function json(fetchImpl: typeof fetch, url: string, timeoutMs: number, accept: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { accept, 'user-agent': 'DSH-F-update-check' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** Read-only, explicit update discovery. It never installs, downloads or changes pins. */
export async function checkForUpdates(options: {
  appVersion: string
  upstreamVersion: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<UpdateCheck> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 8000
  const checkedAt = new Date().toISOString()
  const components: UpdateComponent[] = []

  try {
    const value = await json(fetchImpl, APP_RELEASE_API, timeoutMs, 'application/vnd.github+json')
    const parsed = z.object({ tag_name: z.string() }).safeParse(value)
    if (!parsed.success) throw new Error('Respuesta de release no válida')
    const tag = parsed.data.tag_name.replace(/^v/u, '')
    if (!EXACT_VERSION.test(tag)) throw new Error('Tag de release no válido')
    components.push({ id: 'app', current: options.appVersion, available: newerCandidate(options.appVersion, [tag]), checkedAt, source: APP_RELEASES_URL })
  } catch (error) {
    components.push({ id: 'app', current: options.appVersion, available: null, checkedAt, source: APP_RELEASES_URL, error: errorMessage(error).slice(0, 300) })
  }

  try {
    const value = await json(fetchImpl, ENGINE_REGISTRY_URL, timeoutMs, 'application/vnd.npm.install-v1+json')
    const parsed = z.object({ 'dist-tags': z.record(z.string(), z.string()) }).safeParse(value)
    if (!parsed.success) throw new Error('Respuesta de registro no válida')
    const tags = parsed.data['dist-tags']
    // Do not trust `latest` blindly: inspect the published exact tags and only
    // surface a newer exact version. Prereleases still require manual review.
    components.push({ id: 'engine', current: options.upstreamVersion, available: newerCandidate(options.upstreamVersion, [tags.latest, tags.next]), checkedAt, source: ENGINE_PACKAGE_URL, tags })
  } catch (error) {
    components.push({ id: 'engine', current: options.upstreamVersion, available: null, checkedAt, source: ENGINE_REGISTRY_URL, error: errorMessage(error).slice(0, 300) })
  }

  return { checkedAt, components }
}
