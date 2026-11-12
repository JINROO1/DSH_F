import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post('/__desktop/command', {
    data: { channel: 'settings:set', payload: { theme: 'dark', language: 'es', reduceMotion: false, onboardingDismissed: false } },
  })
  expect(reset.ok()).toBeTruthy()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Construye algo/ })).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/loading/)
  await expect(page.getByText('Motor listo', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
})

test('la guía de inicio se descarta, persiste y se reabre desde ajustes', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible()
  await expect(page.getByText('Conecta tu cuenta o API key solo dentro de Harness. Esta shell no pide ni guarda claves.')).toBeVisible()
  await page.getByRole('button', { name: 'Ocultar guía' }).click()
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await page.getByRole('button', { name: 'Mostrar guía de inicio' }).click()
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible()
})

test('diagnóstico muestra recuperación, filtra el registro y copia solo texto redactado', async ({ page }) => {
  await page.getByRole('button', { name: 'Diagnóstico', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Estado y recuperación del motor' })).toBeVisible()
  await expect(page.getByText('Intentos de arranque')).toBeVisible()
  const log = page.getByRole('region', { name: 'Registro local' })
  await expect(log).toContainText('Harness', { timeout: 20_000 })
  await page.getByRole('combobox', { name: 'Nivel' }).selectOption('error')
  await page.getByRole('textbox', { name: 'Filtrar registro' }).fill('Harness')
  // The real log may legitimately have no error entries; the empty state must be explicit.
  if (await page.getByText('No hay entradas que coincidan con el filtro.').isVisible()) {
    await page.getByRole('combobox', { name: 'Nivel' }).selectOption('info')
  }
  await expect(log).toContainText('Harness')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as unknown as { __copied: string }).__copied = text } },
    })
  })
  await page.getByRole('button', { name: 'Copiar registro filtrado' }).click()
  await expect(page.getByText('Registro copiado')).toBeVisible()
  const copied = await page.evaluate(() => (window as unknown as { __copied: string }).__copied)
  expect(copied).toContain('Harness')
  expect(copied).not.toMatch(/token=[A-Za-z0-9_-]{43}/)
})
