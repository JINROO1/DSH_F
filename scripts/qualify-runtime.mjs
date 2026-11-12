#!/usr/bin/env node
// Cualifica el runtime instalado con el motor real. Sin este artefacto vigente,
// stage-runtime se niega a preparar un RPM.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtime = join(root, 'runtime')
const destination = join(root, '.packaging')
const qualificationPath = join(destination, 'qualification.json')
// Invalida cualquier cualificación anterior antes de empezar: si algo falla,
// package:runtime no debe poder usar un resultado viejo.
await rm(qualificationPath, { force: true })
const upstream = JSON.parse(await readFile(join(runtime, 'upstream.json'), 'utf8'))
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const inputs = {
  'runtime/package.json': await hash(join(runtime, 'package.json')),
  'runtime/package-lock.json': await hash(join(runtime, 'package-lock.json')),
  'runtime/upstream.json': await hash(join(runtime, 'upstream.json')),
  'src/renderer/harness-theme.css': await hash(join(root, 'src/renderer/harness-theme.css')),
  'src/renderer/styles.css': await hash(join(root, 'src/renderer/styles.css')),
}
console.log('Auditando dependencias…')
execFileSync('npm', ['run', 'audit:dependencies'], { cwd: root, stdio: 'inherit' })
console.log('Cualificando con typecheck, cobertura, build, integración real y E2E…')
execFileSync('npm', ['run', 'check'], { cwd: root, stdio: 'inherit' })
await mkdir(destination, { recursive: true })
const qualification = {
  schemaVersion: 2,
  upstream: upstream.version,
  node: upstream.nodeVersion,
  inputs,
  qualifiedAt: new Date().toISOString(),
  checks: ['audit:dependencies', 'typecheck', 'test:coverage', 'build', 'test:integration', 'test:e2e'],
}
await writeFile(qualificationPath, JSON.stringify(qualification, null, 2) + '\n')
console.log(`Runtime ${upstream.version} cualificado. Ya puedes ejecutar npm run package:fedora.`)
