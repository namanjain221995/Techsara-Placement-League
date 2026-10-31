import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the PRODUCTION build (`npm run build` first) on port 3100 with
 * an isolated embedded PostgreSQL (.data/postgres-e2e), so they never touch demo or event data.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      PORT: "3100",
      HOST: "127.0.0.1",
      DATABASE_URL: "",
      EMBEDDED_PG_PORT: "5435",
      EMBEDDED_PG_DIR: ".data/postgres-e2e",
      UPLOAD_DIR: ".data/uploads-e2e",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "e2e-password-123",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } }],
});
