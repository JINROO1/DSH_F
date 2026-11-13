import { stat } from 'node:fs/promises'
import type { WorkspaceAvailability } from '../shared/contracts.js'

/** Read-only availability check. Permission errors are not treated as missing. */
export async function checkWorkspacePaths(paths: readonly string[]): Promise<WorkspaceAvailability[]> {
  return Promise.all(paths.map(async path => {
    try {
      return { path, missing: !(await stat(path)).isDirectory() }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      return { path, missing: code === 'ENOENT' || code === 'ENOTDIR' }
    }
  }))
}

export async function missingWorkspacePaths(paths: readonly string[]): Promise<string[]> {
  return (await checkWorkspacePaths(paths)).filter(item => item.missing).map(item => item.path)
}
