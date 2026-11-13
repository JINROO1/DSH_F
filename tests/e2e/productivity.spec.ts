import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const demo = '/home/user/DSH_F/.preview/workspaces/proyecto-demo'
const templateDir = join(process.cwd(), '.preview/workspaces/plantilla-e2e')

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post('/__desktop/command', {
    data: { channel: 'settings:set', payload: { theme: 'dark', language: 'es', reduceMotion: false, onboardingDismissed: true, notificationsEnabled: true } },
  })
  expect(reset.ok()).toBeTruthy()
  const state = await (await page.request.post('/__desktop/command', { data: { channel: 'state:get' } })).json()
  for (const project of state.value.recent) {
    await page.request.post('/__desktop/command', { data: { channel: 'workspace:forget', payload: { path: project.path } } })
  }
  await rm(templateDir, { recursive: true, force: true })
  await page.goto('/')
  await expect(page.locator('.app-shell')).not.toHaveClass(/loading/)
  await expect(page.getByText('Motor listo', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
})

test('la paleta aplica tema y abre diagnóstico solo con teclado', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Paleta de comandos' }).fill('Tema claro')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Paleta de comandos' }).fill('Ver diagnóstico')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Diagnóstico', exact: true })).toBeVisible()
})

test('proyectos: favoritos, alias, plantilla sin sobrescritura y limpieza de rutas rotas', async ({ page }) => {
  await page.getByRole('button', { name: 'Abrir un proyecto' }).first().click()
  await page.getByRole('dialog', { name: 'Abrir carpeta de demostración' }).getByRole('button', { name: 'Añadir proyecto' }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Favorito: proyecto-demo' }).click()
  await expect(page.getByRole('button', { name: 'Quitar favorito: proyecto-demo' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Editar alias: proyecto-demo' }).click()
  await page.getByRole('dialog', { name: 'Editar alias' }).getByLabel('Alias', { exact: true }).fill('Demo alias')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.locator('.project-row', { hasText: 'Demo alias' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Filtrar proyectos…' }).fill('Demo alias')
  await expect(page.locator('.project-row')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Filtrar proyectos…' }).fill('')

  await page.getByRole('button', { name: 'Crear desde plantilla' }).click()
  const template = page.getByRole('dialog', { name: 'Crear desde plantilla' })
  await template.getByLabel('Nombre de la carpeta').fill('plantilla-e2e')
  await template.getByLabel('Plantilla', { exact: true }).selectOption('node')
  await template.getByRole('button', { name: 'Crear desde plantilla' }).click()
  await expect(page.getByText('Plantilla creada')).toBeVisible()
  await expect(page.locator('.project-row', { hasText: 'plantilla-e2e' })).toBeVisible()

  await page.getByRole('button', { name: 'Crear desde plantilla' }).click()
  const duplicate = page.getByRole('dialog', { name: 'Crear desde plantilla' })
  await duplicate.getByLabel('Nombre de la carpeta').fill('plantilla-e2e')
  await duplicate.getByRole('button', { name: 'Crear desde plantilla' }).click()
  await expect(duplicate.getByRole('alert')).toBeVisible()
  await duplicate.getByRole('button', { name: 'Cancelar' }).click()

  await rm(templateDir, { recursive: true, force: true })
  await page.getByRole('button', { name: 'Comprobar rutas' }).click()
  await expect(page.locator('.project-row', { hasText: 'plantilla-e2e' }).getByText('Ruta inexistente')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar rutas inexistentes' }).click()
  await expect(page.locator('.project-row', { hasText: 'plantilla-e2e' })).toHaveCount(0)
  await expect(page.locator('.project-row', { hasText: 'Demo alias' })).toBeVisible()
})

test('preferencias: exportación descargable e importación con vista previa y rechazo de secretos', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toBe('dsh-fedora-preferencias.json')
  await page.getByRole('button', { name: 'Importar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Importar', exact: true })
  const textarea = dialog.getByLabel('JSON de preferencias')
  await textarea.fill(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), settings: { theme: 'dark', apiKey: 'secret' } }))
  await dialog.getByRole('button', { name: 'Revisar cambios' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Aplicar importación' })).toHaveCount(0)
  await textarea.fill(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), settings: { theme: 'light', language: 'en' } }))
  await dialog.getByRole('button', { name: 'Revisar cambios' }).click()
  await expect(dialog.getByText('Cambios detectados')).toBeVisible()
  await expect(dialog.getByText('Oscuro → Claro')).toBeVisible()
  await dialog.getByRole('button', { name: 'Aplicar importación' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('los textos nuevos en inglés caben y el diálogo de plantilla pasa axe', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en')
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create from template' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check paths' })).toBeVisible()
  await page.setViewportSize({ width: 960, height: 800 })
  const overflow = await page.locator('.project-tools .button, .page-heading .button').evaluateAll(buttons => buttons.filter(button => button.scrollWidth > button.clientWidth + 1).length)
  expect(overflow).toBe(0)
  await page.getByRole('button', { name: 'Create from template' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create from template' })
  await expect(dialog).toBeVisible()
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).exclude('iframe').analyze()
  expect(results.violations).toEqual([])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})
