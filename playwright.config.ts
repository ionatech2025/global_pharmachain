import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite. Expects a running stack (see e2e/README.md):
 *   PostgreSQL with migrations + seed · API on :3001 · web on :3000
 * The golden path mutates trade state, so it runs single-worker.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["line"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
