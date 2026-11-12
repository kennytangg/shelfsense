import { defineConfig, devices } from "@playwright/test";

/**
 * One production server and one disposable database are shared by all specs,
 * so specs run serially, in file order, in a single worker.
 */
export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  outputDir: "./.artifacts/results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "./.artifacts/report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
    // Same override as scripts/browser-smoke.ts, for machines whose installed
    // Chromium revision differs from the one this Playwright version expects.
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
