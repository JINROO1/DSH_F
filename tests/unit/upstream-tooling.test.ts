import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { UPSTREAM_COMMIT, UPSTREAM_VERSION } from '../../src/shared/contracts.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = join(root, 'scripts/prepare-upstream.mjs')

describe('herramientas de actualización upstream', () => {
  it('mantiene contratos, manifiesto y pin del runtime en la misma versión', async () => {
    const upstream = JSON.parse(await readFile(join(root, 'runtime/upstream.json'), 'utf8'))
    const manifest = JSON.parse(await readFile(join(root, 'runtime/package.json'), 'utf8'))
    const lock = JSON.parse(await readFile(join(root, 'runtime/package-lock.json'), 'utf8'))
    expect(UPSTREAM_VERSION).toBe(upstream.version)
    expect(UPSTREAM_COMMIT).toBe(upstream.sourceCommit)
    expect(manifest.dependencies[upstream.package]).toBe(upstream.version)
    expect(manifest.dependencies[upstream.nodePackage]).toBe(upstream.nodeVersion)
    expect(lock.packages[''].dependencies[upstream.package]).toBe(upstream.version)
  })
  it('el dry-run no modifica archivos y muestra el cambio propuesto', async () => {
    const before = await readFile(join(root, 'runtime/upstream.json'), 'utf8')
    const output = execFileSync(process.execPath, [script, '--version', '9.9.9', '--dry-run'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(output).toContain('9.9.9')
    expect(output).toContain('Dry-run')
    expect(await readFile(join(root, 'runtime/upstream.json'), 'utf8')).toBe(before)
  })
  it('rechaza versiones con rangos, commits incompletos y opciones desconocidas', () => {
    expect(() => execFileSync(process.execPath, [script, '--version', '^1.2.3'], { cwd: root, stdio: 'pipe' })).toThrow()
    expect(() => execFileSync(process.execPath, [script, '--version', '1.2.3', '--commit', 'abc123'], { cwd: root, stdio: 'pipe' })).toThrow()
    expect(() => execFileSync(process.execPath, [script, '--version', '1.2.3', '--latest'], { cwd: root, stdio: 'pipe' })).toThrow()
  })
  it('mantiene bloques gestionados para las referencias documentales', async () => {
    for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md', 'docs/UPSTREAM.md']) {
      const text = await readFile(join(root, file), 'utf8')
      expect(text).toContain('<!-- upstream:')
    }
    expect(await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('<!-- upstream:node -->')
  })
})
