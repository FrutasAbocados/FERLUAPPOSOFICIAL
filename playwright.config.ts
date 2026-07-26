import { defineConfig, devices } from '@playwright/test'

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'https://abocadosos.vercel.app'
const isCI = !!process.env.CI
const htmlOutputDir = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? 'playwright-report'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // login compartido — secuencial para evitar races con la sesión
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: htmlOutputDir }]]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-smoke',
      testIgnore: /99-visual-audit\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-visual',
      testMatch: /99-visual-audit\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
