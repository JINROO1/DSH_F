import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post('/__desktop/command', {
    data: { channel: 'settings:set', payload: { theme: 'dark', language: 'es', reduceMotion: false, onboardingDismissed: true } },
  })
  expect(reset.ok()).toBeTruthy()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Construye algo/ })).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/loading/)
  await expect(page.getByText('Motor listo', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
})

test('la comprobación manual es explícita, no modal y tolera falta de red', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Actualizaciones', exact: true })).toBeVisible()
  // No background request on load: the result only appears after the explicit click.
  await expect(page.getByText('Comprobación sin red (modo de prueba)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Comprobar actualizaciones', exact: true }).click()
  await expect(page.getByText('Comprobación sin red (modo de prueba)').first()).toBeVisible()
  await expect(page.getByText('Sin versión exacta más nueva detectada').first()).toBeVisible()
  await expect(page.getByText('Comprobación manual y de solo lectura. No descarga ni instala nada; el motor se actualiza solo con el flujo cualificado.')).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:3100/')
})
