import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TemplateKind } from '../shared/contracts.js'

const FILES: Record<TemplateKind, Record<string, string>> = {
  empty: { 'README.md': '# Proyecto vacío\n\nCreado por DSH_F. No se ejecutaron instalaciones.\n' },
  node: {
    'README.md': '# Proyecto Node\n\nPlantilla mínima. Ejecuta instalaciones manualmente solo si las necesitas.\n',
    'package.json': '{\n  "name": "dshf-project",\n  "private": true,\n  "version": "0.0.0",\n  "scripts": { "test": "echo \\"sin pruebas\\"" }\n}\n',
  },
  python: {
    'README.md': '# Proyecto Python\n\nPlantilla mínima. No se creó entorno virtual ni se instalaron dependencias.\n',
    'pyproject.toml': '[project]\nname = "dshf-project"\nversion = "0.0.0"\nrequires-python = ">=3.11"\n',
  },
  docs: {
    'README.md': '# Documentación\n\nPlantilla mínima para notas y documentación.\n',
    'docs/README.md': '# Documentos\n\nAñade aquí tus archivos.\n',
  },
  scripts: {
    'README.md': '# Scripts\n\nRevisa cualquier script antes de ejecutarlo.\n',
    'run.sh': '#!/usr/bin/env sh\necho "Revisa este script antes de ejecutarlo."\n',
  },
}

/** Creates a new minimal project folder without overwriting or installing anything. */
export async function createTemplate(parentPath: string, name: string, template: TemplateKind): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 120 || /[/\\\0\n]/u.test(trimmed) || trimmed === '.' || trimmed === '..') throw new Error('Nombre de carpeta no válido')
  if (!parentPath.startsWith('/') || parentPath.includes('\0') || parentPath.includes('\n')) throw new Error('Ruta absoluta requerida')
  const target = join(parentPath, trimmed)
  if (!(await stat(parentPath)).isDirectory()) throw new Error('La carpeta de destino no existe')
  await mkdir(target, { recursive: false, mode: 0o700 })
  try {
    for (const [file, content] of Object.entries(FILES[template])) {
      const path = join(target, file)
      await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
      await writeFile(path, content.replace(/dshf-project/gu, trimmed.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'dshf-project'), { mode: file.endsWith('.sh') ? 0o755 : 0o644, flag: 'wx' })
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  return target
}
