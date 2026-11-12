import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const guard = fileURLToPath(new URL('../../src/main/lifecycle-guard.mjs', import.meta.url))

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}
async function waitFor(predicate: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('Condición no alcanzada')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

describe('lifecycle guard', () => {
  it('reaps the detached child when the parent IPC channel disappears', async () => {
    const child = spawn(process.execPath, ['--import', guard, '-e', 'setInterval(() => {}, 1000)'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: process.platform === 'linux',
    })
    const pid = child.pid!
    await new Promise(resolve => child.once('spawn', resolve))
    expect(alive(pid)).toBe(true)
    child.disconnect()
    await waitFor(() => !alive(pid))
    expect(alive(pid)).toBe(false)
  })
  it('does not kill a child that was explicitly released before disconnect', async () => {
    const child = spawn(process.execPath, ['--import', guard, '-e', 'setInterval(() => {}, 1000)'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: process.platform === 'linux',
    })
    const pid = child.pid!
    await new Promise(resolve => child.once('spawn', resolve))
    child.send({ type: 'dshf:release' })
    await new Promise(resolve => setTimeout(resolve, 50))
    child.disconnect()
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(alive(pid)).toBe(true)
    child.kill('SIGKILL')
    await new Promise(resolve => child.once('exit', resolve))
  })
})
