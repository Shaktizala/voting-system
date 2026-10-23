import { defineConfig } from "@playwright/test";

/**
 * E2E against the real stack: API on :4000 and Vite dev web on :5173.
 * `webServer` entries reuse already-running dev servers (local) and boot
 * fresh ones in CI.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "full-workflow.spec.ts",
  timeout: 240_000,
  expectTimeout: 10_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      url: "http://localhost:4000/api/health",
      command: "npm --prefix ../server run dev",
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
    {
      url: "http://localhost:5173",
      command: "npm run dev",
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
