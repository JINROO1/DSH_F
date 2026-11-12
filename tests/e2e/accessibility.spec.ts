import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Audits cover the DSH_F shell and its own dialogs. The upstream iframe is
// excluded as a separate product surface; no accessibility rule is disabled.
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

async function chooseTheme(page: Page, theme: 'light' | 'dark' | 'system'): Promise<void> {
  const label = theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await page.getByRole('button', { name: label, exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  // Dismiss the real save toast through the UI instead of hiding it with CSS.
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.locator('.toast')).toHaveCount(0)
}

async function auditShell(page: Page): Promise<void> {
  await page.mouse.move(0, 0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)))
  })
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).exclude('iframe').analyze()
  expect(results.violations).toEqual([])
  // Gradient/kbd contrast can remain "incomplete" in axe and is checked
  // numerically in tests/unit/theme-contrast.test.ts. Prohibited ARIA is not.
  expect(results.incomplete.filter(rule => rule.id === 'aria-prohibited-attr')).toEqual([])
}

const scenes = ['Inicio', 'Proyectos', 'Ajustes', 'Diagnóstico', 'paleta', 'diálogo-proyecto'] as const
for (const theme of ['light', 'dark'] as const) {
  for (const scene of scenes) {
    test(`axe ${theme === 'light' ? 'claro' : 'oscuro'}/${scene}`, async ({ page }) => {
      await chooseTheme(page, theme)
      if (scene === 'paleta') {
        await page.keyboard.press('Control+k')
        await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible()
      } else if (scene === 'diálogo-proyecto') {
        await page.getByRole('button', { name: 'Abrir un proyecto' }).first().click()
        await expect(page.getByRole('dialog', { name: 'Abrir carpeta de demostración' })).toBeVisible()
      } else if (scene !== 'Ajustes') {
        await page.getByRole('button', { name: scene, exact: true }).click()
        await expect(page.getByRole('heading', scene === 'Inicio' ? { name: /Construye algo/ } : { name: scene, exact: true })).toBeVisible()
      }
      await auditShell(page)
    })
  }
}

test('teclado, foco visible y diálogos devuelven el foco al control que los abrió', async ({ page }) => {
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Espacio de trabajo' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  const outline = await skip.evaluate(element => {
    const style = getComputedStyle(element)
    return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor }
  })
  expect(outline.width).toBe('2px')
  expect(outline.style).toBe('solid')
  expect(outline.color).not.toBe('transparent')
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL('http://127.0.0.1:3100/')

  const search = page.locator('.sidebar-search')
  await search.focus()
  await page.keyboard.press('Control+k')
  const input = page.getByRole('combobox', { name: 'Paleta de comandos' })
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-activedescendant', 'palette-action-home')
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'palette-action-agent')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toHaveCount(0)
  await expect(search).toBeFocused()

  const open = page.getByRole('button', { name: 'Abrir un proyecto' }).first()
  await open.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Abrir carpeta de demostración' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Abrir carpeta de demostración' })).toHaveCount(0)
  await expect(open).toBeFocused()
})

test('tema sistema y movimiento reducido respetan la preferencia del entorno', async ({ page }) => {
  await chooseTheme(page, 'system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#f7f8fb')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#101318')

  const motion = page.getByRole('switch', { name: 'Reducir movimiento' })
  await motion.click()
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0)
  // The OS preference must also work when the in-app toggle is off.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await motion.click()
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false')
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0)
})

test('el registro desplazable expone una región con nombre y recibe foco', async ({ page }) => {
  await page.getByRole('button', { name: 'Diagnóstico', exact: true }).click()
  const log = page.getByRole('region', { name: 'Registro local' })
  await expect(log).toBeVisible()
  await log.focus()
  await expect(log).toBeFocused()
  await expect(log).not.toContainText(/token=[A-Za-z0-9_-]{43}/)
})
