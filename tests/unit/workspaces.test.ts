import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkWorkspacePaths, missingWorkspacePaths } from '../../src/main/workspaces.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-workspaces-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('disponibilidad de proyectos recientes', () => {
  it('distingue carpetas, archivos y rutas inexistentes sin borrar nada', async () => {
    const folder = join(dir, 'folder')
    const file = join(dir, 'file')
    await mkdir(folder)
    await writeFile(file, 'x')
    const result = await checkWorkspacePaths([folder, file, join(dir, 'missing'), join(file, 'child')])
    expect(result).toEqual([
      { path: folder, missing: false },
      { path: file, missing: true },
      { path: join(dir, 'missing'), missing: true },
      { path: join(file, 'child'), missing: true },
    ])
    expect((await checkWorkspacePaths([folder]))[0]?.missing).toBe(false)
  })

  it('devuelve solo las rutas que se pueden limpiar de recientes', async () => {
    const folder = join(dir, 'folder')
    await mkdir(folder)
    expect(await missingWorkspacePaths([folder, join(dir, 'missing')])).toEqual([join(dir, 'missing')])
  })
})
