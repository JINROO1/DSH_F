import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = join(root, '.packaging/source')
mkdirSync(output, { recursive: true })
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0').filter(Boolean)
const list = join(output, 'files.null')
writeFileSync(list, files.join('\0'))
const archive = join(output, 'dsh-fedora-0.1.0-source.tar.gz')
execFileSync('tar', ['--null', '-T', list, '--transform', 's,^,dsh-fedora-0.1.0/,', '-czf', archive], { cwd: root, stdio: 'inherit' })
console.log(archive)
