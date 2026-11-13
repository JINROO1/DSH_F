import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTemplate } from '../../src/main/templates.js'
import { TEMPLATE_KINDS } from '../../src/shared/contracts.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dshf-template-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('plantillas locales', () => {
  it('crea las cinco plantillas mínimas sin ejecutar instalaciones', async () => {
    for (const kind of TEMPLATE_KINDS) {
      const target = await createTemplate(dir, `proyecto-${kind}`, kind)
      expect((await stat(target)).isDirectory()).toBe(true)
      expect(await readFile(join(target, 'README.md'), 'utf8')).toContain('#')
    }
    expect(JSON.parse(await readFile(join(dir, 'proyecto-node/package.json'), 'utf8')).dependencies).toBeUndefined()
    expect(await readFile(join(dir, 'proyecto-python/pyproject.toml'), 'utf8')).toContain('[project]')
    expect((await stat(join(dir, 'proyecto-docs/docs/README.md'))).isFile()).toBe(true)
    expect((await stat(join(dir, 'proyecto-scripts/run.sh'))).mode & 0o111).toBeGreaterThan(0)
  })

  it('no sobrescribe carpetas existentes y conserva su contenido', async () => {
    const existing = join(dir, 'existing')
    await mkdir(existing)
    await writeFile(join(existing, 'keep.txt'), 'original')
    await expect(createTemplate(dir, 'existing', 'node')).rejects.toThrow()
    expect(await readFile(join(existing, 'keep.txt'), 'utf8')).toBe('original')
  })

  it('rechaza nombres inseguros y destinos inexistentes o que no son carpetas', async () => {
    for (const name of ['', '   ', '../escape', 'a/b', 'a\\b', '.', '..']) {
      await expect(createTemplate(dir, name, 'empty')).rejects.toThrow()
    }
    await expect(createTemplate(join(dir, 'missing'), 'x', 'empty')).rejects.toThrow()
    const file = join(dir, 'file')
    await writeFile(file, 'x')
    await expect(createTemplate(file, 'x', 'empty')).rejects.toThrow()
    await expect(createTemplate('relative', 'x', 'empty')).rejects.toThrow()
  })

  it('normaliza el nombre del paquete sin salir de la carpeta elegida', async () => {
    const target = await createTemplate(dir, 'My App!', 'node')
    expect(target).toBe(join(dir, 'My App!'))
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).name).toBe('my-app')
  })
})
