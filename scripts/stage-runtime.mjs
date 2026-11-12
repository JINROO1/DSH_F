import { cp, mkdir, readFile, rm, writeFile, stat, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = join(root, 'runtime')
const destination = join(root, '.packaging/runtime')
const upstream = JSON.parse(await readFile(join(source, 'upstream.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(source, 'package-lock.json'), 'utf8'))
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
if (!upstream.sourceCommit) throw new Error('Falta el commit verificado de upstream en runtime/upstream.json. No empaquetes sin procedencia.')
if (manifest.dependencies[upstream.package] !== upstream.version) throw new Error('runtime/package.json no coincide con runtime/upstream.json. Ejecuta npm run upstream:prepare.')
if (manifest.dependencies[upstream.nodePackage] !== upstream.nodeVersion) throw new Error('La versión de Node no coincide con runtime/upstream.json.')
if (lock.packages?.['']?.dependencies?.[upstream.package] !== upstream.version) throw new Error('runtime/package-lock.json no coincide con upstream.json. Regenera el lockfile.')
if (lock.packages?.['']?.dependencies?.[upstream.nodePackage] !== upstream.nodeVersion) throw new Error('runtime/package-lock.json no coincide con la versión de Node.')
let qualification
try {
  qualification = JSON.parse(await readFile(join(root, '.packaging/qualification.json'), 'utf8'))
} catch {
  throw new Error('Falta la cualificación del runtime. Ejecuta npm run qualify:runtime antes de empaquetar.')
}
const expectedInputs = {
  'runtime/package.json': await hash(join(source, 'package.json')),
  'runtime/package-lock.json': await hash(join(source, 'package-lock.json')),
  'runtime/upstream.json': await hash(join(source, 'upstream.json')),
  'src/renderer/harness-theme.css': await hash(join(root, 'src/renderer/harness-theme.css')),
  'src/renderer/styles.css': await hash(join(root, 'src/renderer/styles.css')),
}
if (qualification.schemaVersion !== 2 || qualification.upstream !== upstream.version || qualification.node !== upstream.nodeVersion || JSON.stringify(qualification.inputs) !== JSON.stringify(expectedInputs)) {
  throw new Error('La cualificación no coincide con el runtime/tema actual. Ejecuta npm run qualify:runtime después de cualquier cambio.')
}
const installedEngine = JSON.parse(await readFile(join(source, 'node_modules', upstream.package, 'package.json'), 'utf8'))
const installedNode = JSON.parse(await readFile(join(source, 'node_modules', upstream.nodePackage, 'package.json'), 'utf8'))
if (installedEngine.version !== upstream.version || installedNode.version !== upstream.nodeVersion) throw new Error('El runtime instalado no coincide con upstream.json. Ejecuta npm --prefix runtime ci.')
const node = join(source, 'node_modules', upstream.nodePackage, 'bin/node')
const cli = join(source, 'node_modules', upstream.package, 'lib/bin.js')
await access(node, constants.X_OK)
if (!(await stat(cli)).isFile()) throw new Error('Falta runtime/node_modules. Ejecuta npm run setup.')
const reportedNode = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim().replace(/^v/u, '')
if (reportedNode !== upstream.nodeVersion) throw new Error(`El binario Node reporta ${reportedNode}, no ${upstream.nodeVersion}.`)
// Evita mezclar árboles de versiones distintas en el recurso empaquetado.
await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
for (const name of ['package.json', 'package-lock.json', 'upstream.json', 'node_modules']) {
  await cp(join(source, name), join(destination, name), { recursive: true, verbatimSymlinks: true })
}
const inventory = {
  schemaVersion: 2,
  upstream: upstream.version,
  sourceCommit: upstream.sourceCommit,
  node: upstream.nodeVersion,
  overrides: manifest.overrides ?? {},
  qualification: { qualifiedAt: qualification.qualifiedAt, inputs: qualification.inputs },
  files: {
    'package-lock.json': await hash(join(destination, 'package-lock.json')),
    [`node_modules/${upstream.nodePackage}/bin/node`]: await hash(join(destination, 'node_modules', upstream.nodePackage, 'bin/node')),
    [`node_modules/${upstream.package}/lib/bin.js`]: await hash(join(destination, 'node_modules', upstream.package, 'lib/bin.js')),
  },
}
await writeFile(join(destination, 'runtime-manifest.json'), JSON.stringify(inventory, null, 2) + '\n')
console.log(`Runtime ${upstream.version} preparado en ${destination}. Los binarios nativos quedan fuera de app.asar.`)
