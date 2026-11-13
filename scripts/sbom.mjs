#!/usr/bin/env node
// SPDX-lite JSON inventory generated from the pinned lockfiles. No network, no install.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: { out: { type: 'string', default: join(root, 'release/sbom.json') } }, strict: true })
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
function forTarget(value) {
  if (value.os && !value.os.includes('linux')) return false
  if (value.cpu && !value.cpu.includes('x64')) return false
  if (value.libc && !value.libc.includes('glibc')) return false
  return true
}
function components(lock, scope) {
  const packages = lock.packages ?? {}
  return Object.entries(packages)
    .filter(([key, value]) => key.startsWith('node_modules/') && value && !value.dev && value.version && forTarget(value))
    .map(([key, value]) => {
      const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
      return { name, version: value.version, scope, purl: `pkg:npm/${name.replace('@', '%40')}@${value.version}`, ...(value.resolved ? { resolved: value.resolved } : {}), ...(value.integrity ? { integrity: value.integrity } : {}), ...(value.license ? { license: value.license } : {}) }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}
const rootLockPath = join(root, 'package-lock.json')
const runtimeLockPath = join(root, 'runtime/package-lock.json')
const rootLock = JSON.parse(await readFile(rootLockPath, 'utf8'))
const runtimeLock = JSON.parse(await readFile(runtimeLockPath, 'utf8'))
const sbom = {
  schemaVersion: 1,
  target: 'linux-x64-glibc',
  tool: 'DSH_F scripts/sbom.mjs 1.0.0',
  generatedAt: new Date().toISOString(),
  lockfiles: { 'package-lock.json': await hash(rootLockPath), 'runtime/package-lock.json': await hash(runtimeLockPath) },
  components: [...components(rootLock, 'app'), ...components(runtimeLock, 'runtime')],
}
await mkdir(dirname(values.out), { recursive: true })
await writeFile(values.out, JSON.stringify(sbom, null, 2) + '\n')
console.log(`SBOM: ${sbom.components.length} componentes de producción → ${values.out}`)
