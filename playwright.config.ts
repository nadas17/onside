import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — smoke layer.
 *
 * Local: `pnpm test:e2e` boots dev server + runs all tests in tests/e2e/
 * Staging: `BASE_URL=https://onside-staging.vercel.app pnpm test:e2e --grep smoke`
 *
 * CI'de henüz çalışmıyor (Supabase env gerektirir, secret expose riskli) — staging
 * Supabase + Vercel preview kurulumu sonrası enable edilecek.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "tr-TR",
    timezoneId: "Europe/Warsaw",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Local dev: auto-boot the Next dev server before tests
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
