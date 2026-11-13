#!/usr/bin/env node
// Repeatable cold-start/memory baseline for the isolated preview + real Harness runtime.
// It does not optimize anything; it records evidence before any iframe/runtime change.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: {
  runs: { type: 'string', default: '3' },
  port: { type: 'string', default: '3210' },
  out: { type: 'string', default: join(root, 'docs/performance/baseline-2026-11-12.json') },
}, strict: true })
const runs = Number(values.runs)
const port = Number(values.port)
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('--runs debe estar entre 1 y 10')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port no válido')
const sandboxChromium = '/tmp/chromium'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined)
const launchEnv = executablePath === sandboxChromium && existsSync('/tmp/al2023/lib') ? { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp/al2/lib' } : process.env
const base = `http://127.0.0.1:${port}`

async function rssKiB(pid) {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8')
    return Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0)
  } catch { return 0 }
}
async function treeRssKiB(pid) {
  let total = await rssKiB(pid)
  try {
    const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim().split(/\s+/).filter(Boolean).map(Number)
    for (const child of children) total += await treeRssKiB(child)
  } catch { /* procfs may hide children; the parent RSS is still recorded. */ }
  return total
}
async function waitHealthy(timeoutMs) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    try {
      const response = await fetch(`${base}/__desktop/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return
    } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('La vista previa no estuvo lista a tiempo')
}
async function stop(child) {
  if (child.exitCode !== null) return
  const exited = new Promise(resolve => child.once('exit', resolve))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
  await exited
  clearTimeout(timer)
}
const median = values => {
  const sorted = values.filter(value => typeof value === 'number').sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const samples = []
for (let run = 1; run <= runs; run++) {
  const child = spawn(process.execPath, [join(root, 'scripts/preview.mjs'), '--port', String(port)], {
    cwd: root, env: { ...process.env, DSH_TELEMETRY_DISABLED: '1', DSH_UPDATE_CHECK_OFFLINE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
  const started = performance.now()
  let browser
  try {
    await waitHealthy(180_000)
    const engineReadyMs = Math.round(performance.now() - started)
    await fetch(`${base}/__desktop/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'settings:set', payload: { theme: 'dark', language: 'es', reduceMotion: true, onboardingDismissed: true } }) })
    await fetch(`${base}/__desktop/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'workspace:open', payload: { path: join(root, '.preview/workspaces/proyecto-demo') } }) })
    browser = await chromium.launch({ env: launchEnv, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'], ...(executablePath ? { executablePath } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } })
    let webSockets = 0
    const firstWebSocket = new Promise(resolve => page.on('websocket', () => { webSockets++; resolve() }))
    const navigationStarted = performance.now()
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForSelector('.app-shell:not(.loading)', { timeout: 120_000 })
    await page.locator('.primary-nav button[aria-label="Agente"]').click()
    await page.waitForSelector('iframe.harness-frame.visible', { timeout: 120_000 })
    await Promise.race([firstWebSocket, new Promise((_, reject) => setTimeout(() => reject(new Error('Harness no abrió WebSocket')), 120_000))])
    const frameVisibleMs = Math.round(performance.now() - navigationStarted)
    const renderer = await page.evaluate(() => ({
      domContentLoadedMs: Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      resourceCount: performance.getEntriesByType('resource').length,
    }))
    samples.push({ run, engineReadyMs, frameVisibleMs, ...renderer, webSockets, processTreeRssKiB: await treeRssKiB(child.pid) })
    console.log(`Run ${run}: engine=${engineReadyMs}ms frame=${frameVisibleMs}ms rss=${samples.at(-1).processTreeRssKiB}KiB ws=${webSockets}`)
  } catch (error) {
    throw new Error(`Run ${run} falló: ${error.message}\n${stderr}`)
  } finally {
    await browser?.close().catch(() => undefined)
    await stop(child)
  }
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  target: 'preview-linux-x64-glibc',
  command: `node scripts/measure-performance.mjs --runs ${runs} --port ${port}`,
  note: 'Línea base repetible. No se aplicó optimización de iframe/runtime; cualquier mejora futura debe compararse contra este archivo y conservar WebSocket/sesión.',
  runs: samples,
  median: {
    engineReadyMs: median(samples.map(sample => sample.engineReadyMs)),
    frameVisibleMs: median(samples.map(sample => sample.frameVisibleMs)),
    domContentLoadedMs: median(samples.map(sample => sample.domContentLoadedMs)),
    heapBytes: median(samples.map(sample => sample.heapBytes)),
    processTreeRssKiB: median(samples.map(sample => sample.processTreeRssKiB)),
  },
}
await mkdir(dirname(values.out), { recursive: true })
await writeFile(values.out, JSON.stringify(report, null, 2) + '\n')
console.log(`Baseline: ${values.out}`)
