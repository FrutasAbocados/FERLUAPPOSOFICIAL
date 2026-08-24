import { expect, test } from '@playwright/test'
import { loginAdmin } from './auth'

test('Admin supervisa los Pedidos Tarde de Raúl en modo solo lectura', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAdmin(page)

  await page.goto('/trabajadores', { waitUntil: 'domcontentloaded' })
  const pedidosTab = page.getByRole('button', { name: /Pedidos tarde · Raúl/i })

  // CI prueba la URL de producción y Vercel puede tardar unos segundos en
  // propagar el bundle recién desplegado tras el push.
  await expect.poll(async () => {
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker?.getRegistrations() ?? []
      await Promise.all(registrations.map(registration => registration.unregister()))
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.map(key => caches.delete(key)))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    return pedidosTab.waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
  }, {
    timeout: 90_000,
    intervals: [2_000, 5_000, 10_000],
  }).toBe(true)

  const [response] = await Promise.all([
    page.waitForResponse(candidate => (
      candidate.request().method() === 'GET'
      && candidate.url().includes('/rest/v1/trabajadores_pedidos_tarde_facturas')
    )),
    pedidosTab.click(),
  ])

  await expect(page.getByRole('heading', { name: 'Pedidos de tarde · Raúl' })).toBeVisible()
  await expect(page.getByText('Solo lectura', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Incorporar factura/i })).toHaveCount(0)
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)

  expect(response.ok(), `La consulta de Pedidos Tarde devolvió ${response.status()}`).toBe(true)
  await expect(page.getByText(/Facturas del periodo|Sin facturas en este mes/)).toBeVisible()
})
