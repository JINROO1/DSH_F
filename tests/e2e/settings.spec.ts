import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post('/__desktop/command', {
    data: { channel: 'settings:set', payload: { theme: 'dark', language: 'es', reduceMotion: false, onboardingDismissed: true, notificationsEnabled: true } },
  })
  expect(reset.ok()).toBeTruthy()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Construye algo/ })).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/loading/)
  await expect(page.getByText('Motor listo', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
})

test('las notificaciones nativas se pueden silenciar y la preferencia persiste', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  const toggle = page.getByRole('switch', { name: 'Notificaciones nativas' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await expect(page.getByRole('switch', { name: 'Notificaciones nativas' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('switch', { name: 'Notificaciones nativas' }).click()
  await expect(page.getByRole('switch', { name: 'Notificaciones nativas' })).toHaveAttribute('aria-checked', 'true')
})
