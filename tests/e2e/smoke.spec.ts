import { test, expect } from "@playwright/test";

/**
 * Smoke test — the app boots and the critical onboarding + navigation paths
 * resolve without server errors.
 *
 * Bu test SUPABASE'IN AYAKTA OLDUĞU bir ortamda çalışır:
 *   - Lokalde: `pnpm test:e2e` (dev server + .env.local)
 *   - Staging: `BASE_URL=https://onside-staging.vercel.app pnpm test:e2e`
 *
 * Anonymous auth provider'ın etkin olduğunu varsayar (JoinModal aksi takdirde
 * `Anonymous sign-ins are disabled` hatası verir; bunu test eden bir senaryo
 * staging-readiness check'i olarak da işe yarar).
 */

const NICKNAME = `e2e_${Date.now().toString(36).slice(-6)}`;

test.describe("smoke", () => {
  test("onboarding: nickname → home → events → venues", async ({ page }) => {
    test.skip(
      process.env.CI === "true" && !process.env.SUPABASE_DB_REACHABLE,
      "Skipped in CI: anonymous auth requires real Supabase. Re-enable when staging env wired.",
    );
    // Test asserts Türkçe UI strings (e.g. "yakındaki maçlar" link),
    // so navigate to /tr explicitly — independent of the project's
    // current default locale.
    await page.goto("/tr");
    await expect(page).toHaveURL(/\/tr$/);

    // The JoinModal is no longer auto-opened on first visit (anonymous
    // browsing was made the default). Open it from the header.
    await page
      .getByRole("button", { name: /giriş yap|sign in|zaloguj/i })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Nickname doldur + başla
    const input = page.getByLabel(/nickname/i);
    await input.fill(NICKNAME);
    await page.getByRole("button", { name: /başla|start|zaczynaj/i }).click();

    // Modal kapansın, ana sayfa render olsun
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    // Header'daki kullanıcı adı linkini gör
    await expect(
      page.getByRole("link", { name: `@${NICKNAME}` }),
    ).toBeVisible();

    // /events'e git
    await page.getByRole("link", { name: /yakındaki maçlar/i }).click();
    await expect(page).toHaveURL(/\/tr\/events$/);
    await expect(
      page.getByRole("heading", { name: /yakındaki maçlar/i }),
    ).toBeVisible();

    // /venues'e git
    await page.goto("/tr/venues");
    await expect(page).toHaveURL(/\/tr\/venues$/);
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
