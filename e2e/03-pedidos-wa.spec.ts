import { test, expect } from '@playwright/test'
import { loginAdmin } from './auth'

test.describe('03 · Pedidos WA', () => {
  test('carga la página y muestra los tabs principales', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/pedidos-wa')

    // Match laxo (los tabs tienen icono + texto)
    for (const t of ['Captura', 'Hoja de ruta', 'Clientes', 'Productos', 'Recurrentes']) {
      await expect(page.locator(`text=${t}`).first()).toBeVisible({ timeout: 15_000 })
    }
  })

  test('tab Hoja de ruta carga sin crash', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/pedidos-wa')
    await page.locator('text=Hoja de ruta').first().click()
    await expect(page.locator('body')).not.toContainText(/Algo falló|Error boundary/i)
  })
})
