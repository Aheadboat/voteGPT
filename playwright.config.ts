import { defineConfig, devices } from "@playwright/test"

delete process.env.NO_COLOR

const databaseMarker = process.env.E2E_DATABASE_MARKER ?? ""
const databaseUrl = process.env.E2E_DATABASE_URL?.trim() ?? ""
const residenceEncryptionKeys = JSON.stringify([
  {
    key: Buffer.alloc(32, 17).toString("base64url"),
    version: "e2e-legacy",
  },
  {
    key: Buffer.alloc(32, 29).toString("base64url"),
    version: "e2e-current",
  },
])

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
      "node e2e/seed-session.mjs --start-server",
    env: {
      BETTER_AUTH_SECRET: "e2e-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      E2E_DATABASE_URL: databaseUrl,
      E2E_DATABASE_MARKER: databaseMarker,
      E2E_DESTRUCTIVE_OPT_IN: "1",
      EMAIL_FROM: "test@example.invalid",
      EMAIL_SERVER: "smtp://127.0.0.1:2525",
      GOOGLE_CIVIC_API_KEY: "",
      GOOGLE_CLIENT_ID: "e2e",
      GOOGLE_CLIENT_SECRET: "e2e",
      RESIDENCE_ENCRYPTION_ACTIVE_KEY: "e2e-legacy",
      RESIDENCE_ENCRYPTION_KEYS: residenceEncryptionKeys,
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
