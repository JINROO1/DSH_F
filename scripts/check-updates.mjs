#!/usr/bin/env node
// Comprobación manual y de solo lectura. No descarga, no instala, no cambia pines.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { checkForUpdates } from '../dist/preview-core.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: { json: { type: 'boolean', default: false } }, strict: true })
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const upstream = JSON.parse(await readFile(join(root, 'runtime/upstream.json'), 'utf8'))
const result = await checkForUpdates({ appVersion: pkg.version, upstreamVersion: upstream.version })
if (values.json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`Comprobación manual: ${result.checkedAt}`)
  for (const component of result.components) {
    const name = component.id === 'app' ? 'DSH_F' : 'DeepSeek Harness'
    console.log(`\n${name}`)
    console.log(`  Actual:    ${component.current}`)
    console.log(`  Disponible:${component.available ? ` ${component.available}` : ' ninguna versión exacta más nueva detectada'}`)
    if (component.tags) console.log(`  Tags:      ${Object.entries(component.tags).map(([key, value]) => `${key}=${value}`).join(', ')}`)
    if (component.error) console.log(`  Error:     ${component.error}`)
    console.log(`  Fuente:    ${component.source}`)
  }
  console.log('\nNo se descargó ni instaló nada. Para actualizar el motor:')
  console.log('  npm run upstream:prepare -- --version <x.y.z> --commit <sha>')
  console.log('  npm --prefix runtime ci')
  console.log('  npm run qualify:runtime')
  console.log('  npm run package:fedora')
}
