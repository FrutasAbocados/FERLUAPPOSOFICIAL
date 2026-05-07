import { test, expect } from '@playwright/test'
import { loginAdmin } from './auth'

test.describe('01 · Login', () => {
  test('admin puede entrar y ve el shell autenticado', async ({ page }) => {
    await loginAdmin(page)
    // Sidebar con módulos visibles
    await expect(page.getByRole('link', { name: /^Manager$/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Pedidos$/i }).first()).toBeVisible()
    // No hay errores en consola obvios
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForTimeout(1500)
    expect(errors, `errores JS: ${errors.join(' · ')}`).toEqual([])
  })
})
