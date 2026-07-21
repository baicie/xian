import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 4179 --strictPort',
      url: 'http://127.0.0.1:4179',
      env: { ...process.env, PORT: '4180', WEB_PORT: '4179' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../api start',
      url: 'http://127.0.0.1:4180/api/v1/health/live',
      env: { ...process.env, PORT: '4180' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
