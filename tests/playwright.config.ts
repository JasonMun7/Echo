import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for Echo web app.
 * Run with: pnpm test:e2e
 * Requires: backend (port 8000) and web (port 3000) - use pnpm dev:all in another terminal, or let webServer start them.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "./playwright-report" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "cd ../backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000",
      url: "http://localhost:8000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "cd ../apps/web && pnpm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
