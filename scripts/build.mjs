import { build } from 'esbuild'
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = fileURLToPath(new URL('..', import.meta.url))
await mkdir(resolve(root, 'dist'), { recursive: true })
const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: false, legalComments: 'inline', logLevel: 'info' }
await build({ ...common, entryPoints: [resolve(root, 'src/main/index.ts')], outfile: resolve(root, 'dist/main.js'), format: 'esm', packages: 'external', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } })
await build({ ...common, entryPoints: [resolve(root, 'src/main/preload.ts')], outfile: resolve(root, 'dist/preload.cjs'), format: 'cjs', external: ['electron'] })
await build({ ...common, entryPoints: [resolve(root, 'src/preview/core.ts')], outfile: resolve(root, 'dist/preview-core.js'), format: 'esm', packages: 'external' })
await build({ ...common, platform: 'browser', target: 'chrome130', entryPoints: [resolve(root, 'src/renderer/main.tsx')], outfile: resolve(root, 'dist/renderer/app.js'), format: 'iife', minify: true, define: { 'process.env.NODE_ENV': '"production"' } })
await cp(resolve(root, 'src/renderer/index.html'), resolve(root, 'dist/index.html'))
await cp(resolve(root, 'src/renderer/styles.css'), resolve(root, 'dist/renderer/styles.css'))
await cp(resolve(root, 'src/renderer/harness-theme.css'), resolve(root, 'dist/renderer/harness-theme.css'))
await cp(resolve(root, 'src/renderer/preview-adapter.js'), resolve(root, 'dist/renderer/preview-adapter.js'))
await cp(resolve(root, 'src/main/lifecycle-guard.mjs'), resolve(root, 'dist/lifecycle-guard.mjs'))
const svg = await readFile(resolve(root, 'assets/icon.svg'), 'utf8')
for (const size of [512, 24]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  await writeFile(resolve(root, `assets/${size === 512 ? 'icon' : 'tray'}.png`), png)
}
await cp(resolve(root, 'assets'), resolve(root, 'dist/assets'), { recursive: true })
await cp(resolve(root, 'assets'), resolve(root, 'dist/renderer/assets'), { recursive: true })
const fontRoot = resolve(root, 'node_modules/@fontsource-variable/inter/files')
await mkdir(resolve(root, 'dist/renderer/fonts'), { recursive: true })
for (const name of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
  await cp(resolve(fontRoot, name), resolve(root, 'dist/renderer/fonts', name))
}
const html = await readFile(resolve(root, 'dist/index.html'), 'utf8')
await writeFile(resolve(root, 'dist/renderer/index.html'), html.replaceAll('./renderer/', './'))
console.log('Build complete: main, isolated preload, renderer and local assets.')
