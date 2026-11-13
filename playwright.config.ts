import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const sandboxChromium = '/tmp/chromium'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined)
const env = executablePath === sandboxChromium && existsSync('/tmp/al2023/lib')
  ? { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp/al2/lib' }
  : process.env

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 940 },
    locale: 'es-ES',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { env, args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(executablePath ? { executablePath } : {}) },
  },
  webServer: {
    command: 'node scripts/preview.mjs --port 3100',
    url: 'http://127.0.0.1:3100/__desktop/health',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...process.env, DSH_TELEMETRY_DISABLED: '1', DSH_UPDATE_CHECK_OFFLINE: '1' },
  },
})
