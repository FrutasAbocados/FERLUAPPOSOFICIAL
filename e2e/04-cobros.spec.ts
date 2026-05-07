import { test, expect } from '@playwright/test'
import { loginAdmin } from './auth'

test.describe('04 · Cobros (Control deuda)', () => {
  test('carga el módulo y muestra KPIs sin crash', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/cobros')

    // KPI "Vencido" debe estar (puede mostrar importe alto, 0€ o similar)
    await expect(page.locator('body')).toContainText(/Vencid/i, { timeout: 15_000 })

    // Tabla/listado de clientes o facturas con encabezados conocidos
    await expect(page.locator('body')).toContainText(/Cliente|Importe|Factura/i)

    // No hay error boundary disparado
    await expect(page.locator('body')).not.toContainText(/Algo falló|Error boundary/i)
  })
})
