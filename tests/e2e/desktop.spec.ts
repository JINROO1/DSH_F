import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Construye algo/ })).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/loading/)
  // El motor oficial puede tardar bajo carga; no exercising RPC antes de ready.
  await expect(page.getByText('Motor listo', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
})

test('portada premium, navegación y paleta de comandos accesible por teclado', async ({ page }) => {
  await expect(page.getByText('EDICIÓN FEDORA')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir un proyecto' }).first()).toBeVisible()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Paleta de comandos' })
  await expect(palette).toBeVisible()
  await page.getByRole('textbox', { name: 'Paleta de comandos' }).fill('Ajustes')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Inicio', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Construye algo/ })).toBeVisible()
  await expect(page.locator('.hero .button.primary')).toBeEnabled()
  // Esperar el fin real de animaciones/transiciones finitas antes de auditar
  // contraste; axe no debe muestrear colores interpolados.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)))
  })
  // @axe-core/playwright tracks a newer Playwright Page surface than the pinned runner.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).exclude('iframe').analyze()
  expect(results.violations).toEqual([])
})

test('tema, idioma y movimiento reducido se persisten entre recargas', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await page.getByRole('button', { name: 'Claro', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByRole('switch', { name: 'Reduce motion' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
  await page.getByRole('combobox', { name: 'Language' }).selectOption('es')
  await page.getByRole('button', { name: 'Oscuro', exact: true }).click()
  await page.getByRole('switch', { name: 'Reducir movimiento' }).click()
})

test('abre un proyecto de demostración y carga Harness en el marco integrado', async ({ page }) => {
  await page.getByRole('button', { name: 'Abrir un proyecto' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Abrir carpeta de demostración' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Añadir proyecto' }).click()
  await expect(page.getByRole('heading', { name: 'Agente', exact: true })).toBeVisible()
  const frame = page.frameLocator('iframe[title="Agente"]')
  await expect(frame.locator('body')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('iframe[title="Agente"]')).toHaveClass(/visible/, { timeout: 60_000 })
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await expect(page.getByText('proyecto-demo').first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Filtrar proyectos…' }).fill('no-existe')
  await expect(page.getByText('Tu próximo proyecto empieza aquí')).toBeVisible()
  await page.getByRole('textbox', { name: 'Filtrar proyectos…' }).fill('proyecto-demo')
  await page.getByRole('button', { name: /Quitar de recientes: proyecto-demo/ }).click()
  await expect(page.getByText('Proyecto quitado de recientes')).toBeVisible()
})

test('diagnóstico redactado y exportación descargable', async ({ page }) => {
  await page.getByRole('button', { name: 'Diagnóstico', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Diagnóstico', exact: true })).toBeVisible()
  await expect(page.getByLabel('Registro local')).not.toContainText(/token=[A-Za-z0-9_-]{43}/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar diagnóstico' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('dsh-fedora-diagnostico.txt')
  const path = await file.path()
  expect(path).toBeTruthy()
})

test('detiene y reinicia el motor desde ajustes sin perder la sesión gráfica', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await page.getByRole('button', { name: 'Detener motor' }).click()
  await expect(page.getByText('Motor detenido de forma segura')).toBeVisible()
  await page.getByRole('button', { name: 'Reiniciar motor' }).click()
  await expect(page.getByText('Motor reiniciado')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('Motor listo').first()).toBeVisible({ timeout: 60_000 })
})

test('diseño adaptable y enlaces externos no navegan fuera de la capa', async ({ page }) => {
  await page.setViewportSize({ width: 690, height: 900 })
  await expect(page.getByRole('heading', { name: /Construye algo/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toBeVisible()
  // La vista previa no debe depender de la red exterior: capturamos la URL que
  // el adaptador entregaría a shell.openExternal en la ventana nativa.
  await page.evaluate(() => {
    ;(window as unknown as { __opened: string[] }).__opened = []
    window.open = ((url?: string | URL) => {
      ;(window as unknown as { __opened: string[] }).__opened.push(String(url))
      return null
    }) as typeof window.open
  })
  await page.getByRole('button', { name: 'Documentación oficial' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toContain('https://github.com/deepseek-ai/deepseek-harness')
  await expect(page).toHaveURL('http://127.0.0.1:3100/')
})
