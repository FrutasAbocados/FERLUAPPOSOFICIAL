import { test, expect } from '@playwright/test'
import { loginAdmin } from './auth'

test.describe('05 · Caja', () => {
  test('carga sub-tabs Calendario y Cierre día sin error', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/cash')

    // Header del módulo
    await expect(page.locator('body')).toContainText(/Caja|Cierre/i)

    // Hay al menos un sub-tab de calendario / cierre
    await expect(page.locator('body')).toContainText(/Calendario|Cierre/i)

    // No hay error boundary disparado
    await expect(page.locator('body')).not.toContainText(/Algo falló|Error boundary/i)
  })
})
