import { test, expect } from "@playwright/test";

test.describe("/api/health", () => {
  test("returns 200 with status payload", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      timestamp: expect.any(String),
      uptime: expect.any(Number),
    });
  });

  test("includes db check field", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(body.db).toMatch(/^(ok|error|skipped)$/);
  });
});
