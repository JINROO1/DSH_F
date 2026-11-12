#!/usr/bin/env node
// Prepara una actualización del motor oficial. No cualifica ni publica por sí solo:
// al terminar exige npm run qualify:runtime y revisión humana de overrides/contratos.
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtime = join(root, 'runtime')
const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    'node-version': { type: 'string' },
    commit: { type: 'string' },
    install: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})
const version = values.version
const nodeVersion = values['node-version']
const commit = values.commit
const install = values.install
const dryRun = values['dry-run']
if (!version) {
  console.log('Uso: npm run upstream:prepare -- --version <x.y.z[-prerelease]> [--node-version <x.y.z>] [--commit <sha>] [--install] [--dry-run]')
  process.exit(0)
}
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
if (!exactVersion.test(version)) throw new Error('La versión del motor debe ser exacta, sin rangos ni etiquetas.')
if (nodeVersion && !exactVersion.test(nodeVersion)) throw new Error('La versión de Node debe ser exacta.')
if (commit && !/^[0-9a-f]{40}$/u.test(commit)) throw new Error('El commit debe ser un SHA-1 completo de 40 caracteres.')

const upstreamPath = join(runtime, 'upstream.json')
const packagePath = join(runtime, 'package.json')
const lockPath = join(runtime, 'package-lock.json')
const upstreamRaw = await readFile(upstreamPath, 'utf8')
const packageRaw = await readFile(packagePath, 'utf8')
const lockRaw = await readFile(lockPath, 'utf8')
const upstream = JSON.parse(upstreamRaw)
const manifest = JSON.parse(packageRaw)
const previous = { ...upstream }
const next = {
  ...upstream,
  version,
  ...(nodeVersion ? { nodeVersion } : {}),
  sourceCommit: commit ?? (version === previous.version ? previous.sourceCommit : null),
}
manifest.dependencies[upstream.package] = version
if (nodeVersion) manifest.dependencies[upstream.nodePackage] = nodeVersion

console.log(`Motor: ${previous.version} -> ${next.version}`)
console.log(`Node:  ${previous.nodeVersion} -> ${next.nodeVersion}`)
console.log(`Commit:${previous.sourceCommit ?? ' pendiente'} -> ${next.sourceCommit ?? ' pendiente de verificar'}`)
if (!next.sourceCommit) console.warn('AVISO: falta el commit de upstream. Verifícalo contra el repositorio oficial antes de publicar.')
if (dryRun) {
  console.log('Dry-run: no se escribieron archivos ni se ejecutó npm.')
  process.exit(0)
}

// Confirma que la versión exacta existe y que los documentos tienen los bloques
// gestionados antes de tocar el árbol fijado.
for (const [pkg, ver] of [[upstream.package, version], ...(nodeVersion ? [[upstream.nodePackage, nodeVersion]] : [])]) {
  execFileSync('npm', ['view', `${pkg}@${ver}`, 'version', '--json'], { cwd: runtime, stdio: 'pipe' })
}
for (const [file, markers] of [['README.md', ['version']], ['THIRD_PARTY_NOTICES.md', ['version', 'node']], ['docs/UPSTREAM.md', ['current']]]) {
  const text = await readFile(join(root, file), 'utf8')
  for (const marker of markers) {
    if (!text.includes(`<!-- upstream:${marker} -->`) || !text.includes(`<!-- /upstream:${marker} -->`)) throw new Error(`${file} no tiene el bloque gestionado upstream:${marker}`)
  }
}

await writeFile(packagePath, JSON.stringify(manifest, null, 2) + '\n')
console.log('Regenerando runtime/package-lock.json…')
try {
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: runtime, stdio: 'inherit' })
} catch (error) {
  await writeFile(packagePath, packageRaw)
  await writeFile(lockPath, lockRaw)
  throw error
}
await writeFile(upstreamPath, JSON.stringify(next, null, 2) + '\n')

// Actualiza solo referencias actuales marcadas. La investigación histórica se conserva.
function replaceManaged(text, name, value, file) {
  const pattern = new RegExp(`<!-- upstream:${name} -->[\\s\\S]*?<!-- /upstream:${name} -->`, 'u')
  if (!pattern.test(text)) throw new Error(`${file} no tiene el bloque gestionado upstream:${name}`)
  return text.replace(pattern, `<!-- upstream:${name} -->${value}<!-- /upstream:${name} -->`)
}
{
  const path = join(root, 'README.md')
  const text = await readFile(path, 'utf8')
  await writeFile(path, replaceManaged(text, 'version', `<code>${next.version}</code>`, 'README.md'))
}
{
  const path = join(root, 'THIRD_PARTY_NOTICES.md')
  let text = await readFile(path, 'utf8')
  text = replaceManaged(text, 'version', `\`${next.version}\``, 'THIRD_PARTY_NOTICES.md')
  text = replaceManaged(text, 'node', next.nodeVersion, 'THIRD_PARTY_NOTICES.md')
  await writeFile(path, text)
}
{
  const path = join(root, 'docs/UPSTREAM.md')
  const text = await readFile(path, 'utf8')
  const block = `<!-- upstream:current -->\n- Versión preparada: \`${next.version}\`\n- Node incluido: \`${next.nodeVersion}\`\n- Commit de upstream: ${next.sourceCommit ? `\`${next.sourceCommit}\`` : 'pendiente de verificar'}\n<!-- /upstream:current -->`
  const updated = text.replace(/<!-- upstream:current -->[\s\S]*?<!-- \/upstream:current -->/u, block)
  if (updated === text && !text.includes('<!-- upstream:current -->')) throw new Error('docs/UPSTREAM.md no tiene el bloque gestionado upstream:current')
  await writeFile(path, updated)
}

console.log('Auditando el árbol del motor con los overrides actuales…')
let auditCode = 0
try {
  execFileSync('npm', ['audit', '--omit=dev'], { cwd: runtime, stdio: 'inherit' })
} catch (error) {
  auditCode = error.status ?? 1
}
if (install) {
  console.log('Instalando runtime fijado…')
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: runtime, stdio: 'inherit' })
}
console.log('\nPreparación terminada. Pendiente antes de empaquetar/publicar:')
console.log('  1. Revisar si los overrides de runtime/package.json siguen siendo necesarios.')
console.log('  2. Verificar el commit y las notas de upstream en docs/UPSTREAM.md.')
console.log(`  3. ${install ? '' : 'npm --prefix runtime ci && '}npm run qualify:runtime`)
console.log('  4. En Fedora/CI: smoke Electron, RPM e instalación limpia.')
if (auditCode !== 0) {
  console.error('La auditoría encontró problemas. No empaquetes hasta resolverlos o justificarlos.')
  process.exit(auditCode)
}
