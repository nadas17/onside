import { test, expect } from "@playwright/test";

/**
 * Smoke test — the app boots and the critical anonymous browsing paths
 * resolve without server errors.
 *
 *   - Lokalde: `pnpm test:e2e` (dev server + .env.local)
 *   - Staging: `BASE_URL=https://onside-boisko.vercel.app pnpm test:e2e`
 *
 * No auth required. Identity is now an inline nickname stored in
 * localStorage, surfaced only when the visitor takes an action that
 * needs one (RSVP, chat, score submit). The smoke path here just
 * verifies routing and that public pages render.
 */

test.describe("smoke", () => {
  test("home → events → venues all render", async ({ page }) => {
    await page.goto("/tr");
    await expect(page).toHaveURL(/\/tr$/);

    // Hero CTA ile events feed'e geç
    await page.getByRole("link", { name: /yakındaki maçlar/i }).click();
    await expect(page).toHaveURL(/\/tr\/events$/);
    await expect(
      page.getByRole("heading", { name: /yakındaki maçlar/i }),
    ).toBeVisible();

    // Venues sayfası
    await page.goto("/tr/venues");
    await expect(page).toHaveURL(/\/tr\/venues$/);
  });

  test("create event page is publicly reachable", async ({ page }) => {
    await page.goto("/tr/events/new");
    // Auth gate kalktı; redirect olmamalı.
    await expect(page).toHaveURL(/\/tr\/events\/new$/);
    // Bilgi banner'ı render olmalı (rezervasyon değil uyarısı).
    await expect(page.getByText(/rezervasyon|randevu/i)).toBeVisible();
  });

  test("legal pages render", async ({ page }) => {
    await page.goto("/tr/legal/privacy");
    await expect(
      page.getByRole("heading", { name: /gizlilik/i }),
    ).toBeVisible();

    await page.goto("/tr/legal/terms");
    await expect(
      page.getByRole("heading", { name: /koşullar/i }),
    ).toBeVisible();
  });

  test("locale switch routing", async ({ page }) => {
    await page.goto("/en");
    await expect(page).toHaveURL(/\/en$/);

    await page.goto("/pl");
    await expect(page).toHaveURL(/\/pl$/);
  });
});
