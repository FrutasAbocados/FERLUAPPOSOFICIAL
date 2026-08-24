import { expect, test } from '@playwright/test'
import { loginAdmin } from './auth'

test('Admin supervisa los Pedidos Tarde de Raúl en modo solo lectura', async ({ page }) => {
  await loginAdmin(page)

  const pedidosResponse = page.waitForResponse(response => (
    response.request().method() === 'GET'
    && response.url().includes('/rest/v1/trabajadores_pedidos_tarde_facturas')
  ))

  await page.goto('/trabajadores?tab=pedidos_tarde', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('button', { name: /Pedidos tarde · Raúl/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedidos de tarde · Raúl' })).toBeVisible()
  await expect(page.getByText('Solo lectura', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Incorporar factura/i })).toHaveCount(0)
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)

  const response = await pedidosResponse
  expect(response.ok(), `La consulta de Pedidos Tarde devolvió ${response.status()}`).toBe(true)
  await expect(page.getByText(/Facturas del periodo|Sin facturas en este mes/)).toBeVisible()
})
