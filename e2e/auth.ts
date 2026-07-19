import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

function getCredentials(): { user: string; pass: string } {
  const user = process.env.E2E_USER?.trim()
  const pass = process.env.E2E_PASS
  if (!user || !pass) {
    throw new Error('Faltan E2E_USER/E2E_PASS; configúralos como secretos de CI o variables locales')
  }
  return { user, pass }
}

/**
 * Login admin estándar — espera ver el sidebar autenticado tras el submit.
 * Si la sesión ya estaba persistida en el storage state, salta el login.
 */
export async function loginAdmin(page: Page): Promise<void> {
  const { user, pass } = getCredentials()
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  // Espera a que aparezca o la sesión ya autenticada o el campo email.
  const emailInput = page.locator('input[type="email"], #ab-email').first()
  const passwordInput = page.locator('input[type="password"], #ab-pw').first()
  const appShell = page.getByRole('link', { name: /Manager|Pedidos|Inicio/i }).first()
  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15_000 }),
    appShell.waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => { /* no pasa nada — segunda espera abajo decide */ })

  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(user)
    await passwordInput.fill(pass)
    await page.getByRole('button', { name: /^Entrar/i }).click()
    await expect(appShell).toBeVisible({ timeout: 30_000 })
  }

  // Validación estable de sesión admin: el módulo Manager debe cargar.
  await page.goto('/manager', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: /^Manager$/ }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('ANALÍTICA · MANAGER')).toBeVisible({ timeout: 30_000 })
}
