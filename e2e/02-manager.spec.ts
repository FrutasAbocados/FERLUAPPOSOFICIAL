import { test, expect } from '@playwright/test'
import { loginAdmin } from './auth'

test.describe('02 · Manager', () => {
  test('carga sin error y permite cambiar de tab', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/manager')

    // Header del módulo presente
    await expect(page.getByRole('heading', { name: /^Manager$/ })).toBeVisible()

    // Las 9 tabs principales están renderizadas
    for (const t of ['Resumen', 'Clientes', 'Productos', 'Facturas', 'Calendario', 'Patrones', 'Abuelo', 'Estacionalidad coste']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${t}$`) }).first()).toBeVisible()
    }

    // Cambiar a Productos y verificar que se carga (input búsqueda producto)
    await page.getByRole('button', { name: /^Productos$/ }).click()
    await expect(page.getByPlaceholder(/buscar producto/i).first()).toBeVisible({ timeout: 15_000 })

    // Cambiar a Estacionalidad coste
    await page.getByRole('button', { name: /^Estacionalidad coste$/ }).click()
    await expect(page.locator('body')).toContainText(/Margen medio|productos/i, { timeout: 15_000 })
  })
})
