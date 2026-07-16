import { defineConfig, devices } from "@playwright/test"

delete process.env.NO_COLOR

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    actionTimeout: 10_000,
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node e2e/seed-session.mjs && node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1",
    env: {
      BETTER_AUTH_SECRET: "e2e-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      DATABASE_URL: "pglite://.data/e2e",
      EMAIL_FROM: "test@example.invalid",
      EMAIL_SERVER: "smtp://127.0.0.1:2525",
      GOOGLE_CIVIC_API_KEY: "",
      GOOGLE_CLIENT_ID: "e2e",
      GOOGLE_CLIENT_SECRET: "e2e",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
