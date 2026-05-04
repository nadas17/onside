import { test, expect } from "@playwright/test";

test.describe("security headers", () => {
  test("response includes core hardening headers", async ({ request }) => {
    const res = await request.get("/tr");
    const headers = res.headers();

    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["content-security-policy"]).toContain("default-src");
  });
});
