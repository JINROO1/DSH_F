import { cp, mkdir, readFile, writeFile, stat, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = join(root, 'runtime')
const destination = join(root, '.packaging/runtime')
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
if (manifest.dependencies['@deepseek-ai/dsh'] !== '0.2.2-rc.2') throw new Error('La versión del motor no está fijada a la release cualificada')
const node = join(source, 'node_modules/node-linux-x64/bin/node')
const cli = join(source, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
await access(node, constants.X_OK)
if (!(await stat(cli)).isFile()) throw new Error('Falta runtime/node_modules. Ejecuta npm run setup.')
await mkdir(destination, { recursive: true })
for (const name of ['package.json', 'package-lock.json', 'node_modules']) {
  await cp(join(source, name), join(destination, name), { recursive: true, verbatimSymlinks: true })
}
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const inventory = {
  schemaVersion: 1,
  upstream: '0.2.2-rc.2',
  sourceCommit: 'ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c',
  node: '24.22.3',
  files: {
    'package-lock.json': await hash(join(destination, 'package-lock.json')),
    'node_modules/node-linux-x64/bin/node': await hash(join(destination, 'node_modules/node-linux-x64/bin/node')),
    'node_modules/@deepseek-ai/dsh/lib/bin.js': await hash(join(destination, 'node_modules/@deepseek-ai/dsh/lib/bin.js')),
  },
}
await writeFile(join(destination, 'runtime-manifest.json'), JSON.stringify(inventory, null, 2) + '\n')
console.log(`Runtime preparado en ${destination}. Los binarios nativos quedan fuera de app.asar.`)
