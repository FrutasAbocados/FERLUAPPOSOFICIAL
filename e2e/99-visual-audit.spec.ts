import { test } from '@playwright/test'
import { loginAdmin } from './auth'

// Auditoría visual: capturas reales desktop + móvil de cada módulo.
// Salida: ~/Desktop/REVISION LUIS/visual-audit/
// Ejecutar: npx playwright test e2e/99-visual-audit.spec.ts
const OUT = `${process.env.HOME}/Desktop/REVISION LUIS/visual-audit`

const ROUTES: Array<{ slug: string; path: string }> = [
  { slug: 'dashboard', path: '/' },
  { slug: 'manager', path: '/manager' },
  { slug: 'pedidos-wa', path: '/pedidos-wa' },
  { slug: 'caja', path: '/cash' },
  { slug: 'clientes', path: '/clientes' },
  { slug: 'cobros', path: '/cobros' },
  { slug: 'gastos', path: '/gastos' },
  { slug: 'tesoreria', path: '/tesoreria' },
  { slug: 'trabajadores', path: '/trabajadores' },
  { slug: 'bbdd-trabajadores', path: '/bbdd-trabajadores' },
  { slug: 'sueldos', path: '/sueldos' },
]

test('capturas desktop + movil', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAdmin(page)

  // Desktop 1440x900
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const r of ROUTES) {
    await page.goto(r.path, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/desktop-${r.slug}.png`, fullPage: true }).catch(() => {})
  }

  // Móvil 390x844 (iPhone aprox)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const r of ROUTES) {
    await page.goto(r.path, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/mobile-${r.slug}.png`, fullPage: true }).catch(() => {})
  }
})
