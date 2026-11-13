import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../..', import.meta.url))
let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-supply-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('SBOM y licencias de producción', () => {
  it('genera un SBOM linux-x64 ligado a los lockfiles fijados', async () => {
    const out = join(dir, 'sbom.json')
    await run(process.execPath, [join(root, 'scripts/sbom.mjs'), '--out', out], { cwd: root })
    const sbom = JSON.parse(await readFile(out, 'utf8'))
    expect(sbom.target).toBe('linux-x64-glibc')
    expect(sbom.components.length).toBeGreaterThan(100)
    expect(sbom.lockfiles['package-lock.json']).toMatch(/^[0-9a-f]{64}$/)
    expect(sbom.lockfiles['runtime/package-lock.json']).toMatch(/^[0-9a-f]{64}$/)
    for (const component of sbom.components) {
      expect(component.name).toBeTruthy()
      expect(component.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(component.purl).toContain(`@${component.version}`)
      expect(['app', 'runtime']).toContain(component.scope)
    }
    expect(sbom.components.some((component: { name: string }) => component.name === '@deepseek-ai/dsh')).toBe(true)
  })

  it('el reporte de licencias no deja componentes objetivo sin evidencia y pasa --strict', async () => {
    const out = join(dir, 'licenses.json')
    await run(process.execPath, [join(root, 'scripts/licenses.mjs'), '--out', out, '--strict'], { cwd: root })
    const report = JSON.parse(await readFile(out, 'utf8'))
    expect(report.target).toBe('linux-x64-glibc')
    expect(report.components.length).toBeGreaterThan(100)
    expect(report.missing).toEqual([])
    expect(report.components.every((component: { license: string }) => component.license && component.license !== 'DESCONOCIDA')).toBe(true)
  })
})
