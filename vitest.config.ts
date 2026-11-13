import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/main/{bridge,settings,log,runtime,security,diagnostics,autostart,updates,notifications,templates,workspaces}.ts', 'src/shared/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
})
