import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Sync tests must be sequential — parallel contexts would share the RS server
  // but run in the same process, which is fine. File-level parallelism is OK.
  fullyParallel: false,
  workers: 1,

  use: {
    baseURL: 'http://localhost:5173',
    // Accept self-signed certs if ever needed
    ignoreHTTPSErrors: true,
  },

  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
})
