#!/usr/bin/env node
// Production license report from installed, pinned dependencies. --strict fails on missing evidence.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: { out: { type: 'string', default: join(root, 'release/LICENSES.json') }, strict: { type: 'boolean', default: false } }, strict: true })
function forTarget(value) {
  if (value.os && !value.os.includes('linux')) return false
  if (value.cpu && !value.cpu.includes('x64')) return false
  if (value.libc && !value.libc.includes('glibc')) return false
  return true
}
function licenseOf(pkg) {
  const value = pkg.license ?? pkg.licenses
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.type).filter(Boolean).join(' OR ')
  if (value && typeof value === 'object' && typeof value.type === 'string') return value.type
  return ''
}
async function scan(base, scope) {
  const lock = JSON.parse(await readFile(join(base, 'package-lock.json'), 'utf8'))
  const found = []
  for (const [key, value] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith('node_modules/') || !value || value.dev || !value.version || !forTarget(value)) continue
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
    const dir = join(base, key)
    let pkg = {}
    try { pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) } catch { /* missing install is a review failure */ }
    let license = licenseOf(pkg) || (typeof value.license === 'string' ? value.license : '')
    let licenseFile = ''
    if (!license) {
      const files = await readdir(dir).catch(() => [])
      licenseFile = files.find(file => /^(licen[cs]e|copying)(\..*)?$/iu.test(file)) ?? ''
      if (licenseFile) license = `archivo ${licenseFile}`
    }
    found.push({ name, version: value.version, scope, license: license || 'DESCONOCIDA', ...(licenseFile ? { licenseFile } : {}), ...(value.resolved ? { resolved: value.resolved } : {}) })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}
const components = [...await scan(root, 'app'), ...await scan(join(root, 'runtime'), 'runtime')]
const missing = components.filter(component => component.license === 'DESCONOCIDA')
const report = { schemaVersion: 1, target: 'linux-x64-glibc', generatedAt: new Date().toISOString(), components, missing }
await mkdir(dirname(values.out), { recursive: true })
await writeFile(values.out, JSON.stringify(report, null, 2) + '\n')
console.log(`Licencias: ${components.length} componentes, ${missing.length} sin evidencia → ${values.out}`)
if (missing.length) console.warn(missing.map(component => ` - ${component.scope}/${component.name}@${component.version}`).join('\n'))
if (values.strict && missing.length) process.exit(1)
