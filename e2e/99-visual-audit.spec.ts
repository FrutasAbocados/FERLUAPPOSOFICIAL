import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { loginAdmin } from './auth'

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

const VIEWPORTS = [
  { slug: 'mobile-320x568', width: 320, height: 568 },
  { slug: 'mobile-390x844', width: 390, height: 844 },
  { slug: 'desktop-1440x900', width: 1440, height: 900 },
] as const

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({
    path,
    fullPage: true,
    animations: 'disabled',
  })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function openRoute(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'networkidle' })
  expect(response, `Sin respuesta al navegar a ${path}`).not.toBeNull()
  expect(response?.ok(), `HTTP inválido al navegar a ${path}`).toBe(true)
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.evaluate(() => window.scrollTo(0, 0))

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    scrollX: window.scrollX,
  }))
  expect(layout.scrollX, `Scroll horizontal inesperado en ${path}`).toBe(0)
  expect(
    layout.documentWidth,
    `Overflow horizontal en ${path}: ${layout.documentWidth}px para viewport ${layout.viewportWidth}px`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1)

  await page.waitForTimeout(500)
}

test('capturas admin en desktop y móvil', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const pageErrors: string[] = []
  const apiErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => {
    if (
      response.status() >= 400
      && response.url().includes('.supabase.co/rest/v1/')
    ) {
      apiErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })

  // Login anónimo: comprueba clipping antes de autenticar.
  for (const viewport of VIEWPORTS) {
    await test.step(`login · ${viewport.slug}`, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openRoute(page, '/')
      await expect(page.locator('#ab-email')).toBeVisible()
      await capture(page, testInfo, `${viewport.slug}-login`)

      const submit = page.getByRole('button', { name: /^Entrar a Abocados OS/i })
      await submit.scrollIntoViewIfNeeded()
      await expect(submit).toBeVisible()
    })
  }

  await loginAdmin(page)

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    for (const route of ROUTES) {
      await test.step(`${route.slug} · ${viewport.slug}`, async () => {
        await openRoute(page, route.path)
        await capture(page, testInfo, `${viewport.slug}-${route.slug}`)
      })
    }
  }

  expect(pageErrors, `Errores JavaScript durante la auditoría:\n${pageErrors.join('\n')}`).toEqual([])
  expect(apiErrors, `Errores de Supabase durante la auditoría:\n${apiErrors.join('\n')}`).toEqual([])
})
