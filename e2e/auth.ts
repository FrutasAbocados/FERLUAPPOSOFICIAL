import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

const USER = process.env.E2E_USER ?? 'frutasabocados@gmail.com'
const PASS = process.env.E2E_PASS ?? 'Ferlu2025'

/**
 * Login admin estándar — espera ver el sidebar autenticado tras el submit.
 * Si la sesión ya estaba persistida en el storage state, salta el login.
 */
export async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  // Espera a que aparezca o la sesión ya autenticada o el campo email.
  const emailInput = page.locator('#email')
  const appShell = page.getByRole('link', { name: /Manager|Pedidos|Inicio/i }).first()
  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15_000 }),
    appShell.waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => { /* no pasa nada — segunda espera abajo decide */ })

  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(USER)
    await page.locator('#password').fill(PASS)
    await page.getByRole('button', { name: /^Entrar/i }).click()
  }

  // Validación estable de sesión admin: el módulo Manager debe cargar.
  await page.goto('/manager', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /^Manager$/ })).toBeVisible({ timeout: 30_000 })
}
