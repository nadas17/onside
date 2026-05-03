# Onside Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onside (Next.js 15 + Supabase + Drizzle) projesini PRODUCTION_READINESS_REPORT.md'de tespit edilen %68 olgunluk seviyesinden Sentry, Docker, security headers, error boundaries ve CI/CD iyileştirmeleriyle %90+ enterprise-ready seviyeye çıkar.

**Architecture:** 4 phase'e ayrılmış 13 task. Her phase bağımsız PR olarak gönderilebilir. Sıra kullanıcıya yakın olandan altyapıya doğru: Reliability → Security → Observability → DevOps. Tüm değişiklikler mevcut Next.js App Router yapısına ek; mimari değişikliği yok.

**Tech Stack:** Next.js 15.5 (App Router, typedRoutes), Supabase (Postgres + Auth + Realtime), Drizzle ORM, Vitest 4 + Playwright, GitHub Actions, Vercel host, Upstash Redis (rate-limit, mevcut), Sentry (eklenecek).

**Verified gaps (PRODUCTION_READINESS_REPORT.md teyidi):**

- `src/app/api/` klasörü yok → health endpoint yok (Task 1)
- `src/app/[locale]/error.tsx`, `src/app/global-error.tsx`, `not-found.tsx` yok (Task 2-4)
- `next.config.ts` `headers()` tanımlamıyor → CSP/HSTS yok (Task 5)
- `.env.example` Upstash satırları `#` ile commented (Task 6)
- `package.json` scripts'de `audit` yok (Task 7)
- `@sentry/nextjs` dependency yok, `sentry.*.config.ts` yok (Task 8)
- Repo kökünde `Dockerfile`, `docker-compose.yml` yok (Task 9)
- `.github/workflows/ci.yml`'de `pnpm test:e2e` adımı yok (Task 10)
- `.github/workflows/`'de deploy workflow yok (Task 11)
- `scripts/`'de backup scripti yok (Task 12)
- Lighthouse CI workflow yok (Task 13)

---

## Phase 1: Reliability & Error Handling

### Task 1: Health check endpoint (/api/health)

**Files:**

- Create: `src/app/api/health/route.ts`
- Create: `tests/e2e/health.spec.ts`

**Why:** PRODUCTION_READINESS_REPORT.md:79 — Health endpoint yok. Vercel/Docker/uptime monitoring için zorunlu. Task 9 (Docker HEALTHCHECK) ve Task 11 (CD smoke test) buna bağlı.

- [ ] **Step 1: Failing e2e test yaz**

```typescript
// tests/e2e/health.spec.ts
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
```

- [ ] **Step 2: Test'i fail ettiğini doğrula**

Run: `pnpm test:e2e tests/e2e/health.spec.ts`
Expected: FAIL — endpoint mevcut değil (404)

- [ ] **Step 3: Endpoint'i yaz**

```typescript
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let dbStatus: "ok" | "skipped" | "error" = "skipped";
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "ok";
  } catch {
    dbStatus = "error";
  }

  const body = {
    status: dbStatus === "error" ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: dbStatus,
  };

  return NextResponse.json(body, {
    status: dbStatus === "error" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 4: Middleware bypass'ı doğrula**

`src/middleware.ts`'in matcher'ı `(?!api|_next|_vercel|.*\..*)` zaten api'i hariç tutuyor — değişiklik gerekmez. `pnpm dev` → `http://localhost:3000/api/health` → JSON dönmeli.

- [ ] **Step 5: Test'i pass ettir**

Run: `pnpm test:e2e tests/e2e/health.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/health/route.ts tests/e2e/health.spec.ts
git commit -m "feat(ops): add /api/health endpoint with db connectivity probe"
```

---

### Task 2: Locale-scoped error boundary (error.tsx)

**Files:**

- Create: `src/app/[locale]/error.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/pl.json` — `error.*` keys

**Why:** PRODUCTION_READINESS_REPORT.md:35 — Global error boundary yok, client-side React error handling eksik. Locale-aware reset UX için.

- [ ] **Step 1: i18n key'lerini 3 locale'e ekle**

`messages/tr.json`'a uygun nested konuma:

```json
"error": {
  "title": "Bir şeyler ters gitti",
  "description": "Beklenmeyen bir hata oluştu. Tekrar deneyebilirsin.",
  "retry": "Tekrar dene",
  "home": "Ana sayfaya dön"
}
```

`messages/en.json`:

```json
"error": {
  "title": "Something went wrong",
  "description": "An unexpected error occurred. Please try again.",
  "retry": "Try again",
  "home": "Go to home"
}
```

`messages/pl.json`:

```json
"error": {
  "title": "Coś poszło nie tak",
  "description": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
  "retry": "Spróbuj ponownie",
  "home": "Wróć do strony głównej"
}
```

- [ ] **Step 2: i18n drift check'i çalıştır**

Run: `pnpm i18n:check`
Expected: PASS (3 locale'de aynı key set)

- [ ] **Step 3: error.tsx yaz**

```tsx
// src/app/[locale]/error.tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // Sentry will pick this up once integrated (Task 8)
    console.error("[locale-error]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <div className="flex gap-2">
        <Button onClick={reset}>{t("retry")}</Button>
        <Button variant="outline" asChild>
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Manuel test — bilerek hata fırlat**

Geçici olarak `src/app/[locale]/page.tsx` üst kısmına `throw new Error("test");` ekle, dev sunucusunu çalıştır:
Run: `pnpm dev`
Expected: error.tsx UI 3 dilde geziniyorsa farklı çevirilerle görünür. Test sonra throw'u geri al.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/error.tsx messages/tr.json messages/en.json messages/pl.json
git commit -m "feat(ux): add locale-scoped error boundary with i18n strings"
```

---

### Task 3: Global error fallback (root global-error.tsx)

**Files:**

- Create: `src/app/global-error.tsx`

**Why:** Locale layout veya middleware yıkılırsa locale-scoped error.tsx çalışmaz. Root'ta minimal HTML fallback gerekli (Next.js docs gereği).

- [ ] **Step 1: global-error.tsx yaz**

```tsx
// src/app/global-error.tsx
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
          color: "#0f172a",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Something went wrong
        </h1>
        <p style={{ marginBottom: "1rem" }}>
          The app failed to load. Reload the page or return later.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            background: "#0f172a",
            color: "white",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build'i doğrula**

Run: `pnpm build`
Expected: Output route listesinde `/global-error` görmeli, hata yok.

- [ ] **Step 3: Commit**

```bash
git add src/app/global-error.tsx
git commit -m "feat(ux): add root global-error fallback for catastrophic failures"
```

---

### Task 4: not-found.tsx

**Files:**

- Create: `src/app/[locale]/not-found.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/pl.json` — `notFound.*` keys

**Why:** Default Next 404 sayfası locale-agnostic ve markasız.

- [ ] **Step 1: i18n key'lerini ekle**

`messages/tr.json`:

```json
"notFound": {
  "title": "Sayfa bulunamadı",
  "description": "Aradığın sayfa mevcut değil.",
  "home": "Ana sayfaya dön"
}
```

`messages/en.json`:

```json
"notFound": {
  "title": "Page not found",
  "description": "The page you're looking for doesn't exist.",
  "home": "Back to home"
}
```

`messages/pl.json`:

```json
"notFound": {
  "title": "Strona nie znaleziona",
  "description": "Strona, której szukasz, nie istnieje.",
  "home": "Wróć do strony głównej"
}
```

- [ ] **Step 2: i18n drift check**

Run: `pnpm i18n:check`
Expected: PASS

- [ ] **Step 3: not-found.tsx yaz**

```tsx
// src/app/[locale]/not-found.tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-xl">{t("title")}</p>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <Button asChild>
        <Link href="/">{t("home")}</Link>
      </Button>
    </main>
  );
}
```

- [ ] **Step 4: Manuel doğrulama**

Run: `pnpm dev`
Tarayıcıda `/tr/yok-boyle-bir-sayfa` aç → 404 sayfası locale ile görünmeli.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/not-found.tsx messages/tr.json messages/en.json messages/pl.json
git commit -m "feat(ux): add localized 404 page"
```

---

## Phase 2: Security Hardening

### Task 5: Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy)

**Files:**

- Modify: `next.config.ts`
- Create: `tests/e2e/security-headers.spec.ts`

**Why:** PRODUCTION_READINESS_REPORT.md:171 — Security headers eksik. CSP supabase-realtime + maptile ile uyumlu olmalı.

- [ ] **Step 1: Failing e2e test yaz**

```typescript
// tests/e2e/security-headers.spec.ts
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
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm test:e2e tests/e2e/security-headers.spec.ts`
Expected: FAIL — header yok

- [ ] **Step 3: next.config.ts'i güncelle**

```typescript
// next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "*.supabase.co";

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://${supabaseHost} https://*.tile.openstreetmap.org`,
  `font-src 'self' data:`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 4: Test'i pass ettir**

Run: `pnpm test:e2e tests/e2e/security-headers.spec.ts`
Expected: PASS

- [ ] **Step 5: Realtime + map manuel test**

Run: `pnpm dev` → harita sayfaları (`/tr/venues`), chat (Supabase realtime) çalışıyor mu? CSP ihlal varsa konsol uyarır → `connect-src`'i gerektiği kadar genişlet.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/e2e/security-headers.spec.ts
git commit -m "feat(security): add CSP, HSTS, X-Frame-Options, Permissions-Policy"
```

---

### Task 6: Upstash rate-limit env vars'ı production'da aktive et

**Files:**

- Modify: `.env.example`
- Create: `docs/runbooks/rate-limit-setup.md`

**Why:** PRODUCTION_READINESS_REPORT.md:48 — Upstash envs commented out. Code zaten hazır (`src/lib/rate-limit.ts:21`), sadece env'leri açıp Vercel'e eklemek gerek.

- [ ] **Step 1: .env.example'da yorumu kaldır**

`.env.example`'da şu blok:

```
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

şuna dönüştür:

```
# Production'da zorunlu, dev'de opsiyonel (env yoksa in-memory fallback).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 2: Runbook yaz**

```markdown
# docs/runbooks/rate-limit-setup.md

# Upstash Rate Limit — Production Setup

## Adım 1: Upstash projesi

1. https://console.upstash.com/ → Create Database
2. Region: `eu-west-1` (Vercel default'a yakın)
3. Type: Regional, Eviction: noeviction

## Adım 2: REST credentials

Database → REST API → URL ve Token'ı kopyala.

## Adım 3: Vercel

Vercel project → Settings → Environment Variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- Environment: Production + Preview (dev'de bırakılırsa in-memory fallback)

## Adım 4: Deploy & doğrula

Deploy sonrası Sentry breadcrumb veya `console.log` ile `useUpstash=true`
branch'ine düştüğünü doğrula. Aksi halde `src/lib/rate-limit.ts:21`
koşulunun env okuma sırasını incele.

## Fallback davranışı

Kod zaten in-memory'ye fallback yapıyor (`rateLimitInMemory`).
Upstash 503 dönerse hata loglanır, request devam eder
(`src/lib/rate-limit.ts:127`).
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/runbooks/rate-limit-setup.md
git commit -m "docs(ops): activate Upstash env vars in example, add setup runbook"
```

---

### Task 7: Dependency audit script + CI gate

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Why:** PRODUCTION_READINESS_REPORT.md:57 — `npm audit` yok, güvenlik açıkları taranmıyor.

- [ ] **Step 1: package.json'a script ekle**

`package.json` `scripts` bloğuna:

```json
"audit": "pnpm audit --prod --audit-level=high"
```

- [ ] **Step 2: Lokal çalıştır, baseline gör**

Run: `pnpm audit --prod --audit-level=high`
Expected: 0 high/critical (bulunursa Task sonunda bağımlılık güncelleme gerekebilir).

- [ ] **Step 3: CI workflow'a ekle**

`.github/workflows/ci.yml` içinde "Lint" step'inden sonra ekle:

```yaml
- name: Dependency audit
  run: pnpm audit --prod --audit-level=high
```

- [ ] **Step 4: CI'yi push'ta doğrula**

Branch'i push et, GitHub Actions'da "Dependency audit" step'i geçmeli.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "ci(security): add pnpm audit gate (high+ blocking)"
```

---

## Phase 3: Observability

### Task 8: Sentry entegrasyonu

**Files:**

- Modify: `package.json` (dep ekle)
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `instrumentation.ts`
- Modify: `next.config.ts` (`withSentryConfig` ile sarmala)
- Modify: `.env.example`
- Modify: `src/app/[locale]/error.tsx` (Task 2)
- Modify: `src/app/global-error.tsx` (Task 3)

**Why:** PRODUCTION_READINESS_REPORT.md:114 — En yüksek öncelikli. Production'da hata izleme yok.

- [ ] **Step 1: Sentry SDK ekle**

Run: `pnpm add @sentry/nextjs`
Expected: `package.json` ve `pnpm-lock.yaml` güncel.

- [ ] **Step 2: Client config**

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
});
```

- [ ] **Step 3: Server config**

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
});
```

- [ ] **Step 4: Edge config**

```typescript
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
});
```

- [ ] **Step 5: instrumentation.ts**

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { onRequestError } from "@sentry/nextjs";
```

- [ ] **Step 6: next.config.ts'i sarmala**

`next.config.ts` sonunu şu şekilde güncelle:

```typescript
import { withSentryConfig } from "@sentry/nextjs";

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
};

export default withSentryConfig(withNextIntl(nextConfig), sentryOptions);
```

- [ ] **Step 7: error.tsx'lere captureException ekle**

`src/app/[locale]/error.tsx` üstüne `import * as Sentry from "@sentry/nextjs";` ekle. `useEffect`'i şuna güncelle:

```typescript
useEffect(() => {
  Sentry.captureException(error);
}, [error]);
```

Aynı değişikliği `src/app/global-error.tsx` için de uygula.

- [ ] **Step 8: .env.example'ı güncelle**

`.env.example` sonundaki Sentry bloğunu yerine koy:

```
# --- Hata izleme (Sentry) ---
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=  # CI source-map upload için
```

- [ ] **Step 9: Build'in geçtiğini doğrula**

Run: `pnpm build`
Expected: Sentry uyarısı yok, build başarılı (DSN yoksa "Sentry disabled" mesajı normaldir).

- [ ] **Step 10: Sentry test event gönder (lokal)**

Geçici dosya `src/app/[locale]/sentry-test/page.tsx`:

```tsx
"use client";
export default function SentryTest() {
  return (
    <button
      onClick={() => {
        throw new Error("Sentry probe");
      }}
    >
      Throw
    </button>
  );
}
```

Lokal `.env.local`'a DSN'leri koy → `pnpm dev` → butona bas → Sentry dashboard'da event görmeli. Onaylanınca dosyayı sil.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts instrumentation.ts next.config.ts .env.example src/app/[locale]/error.tsx src/app/global-error.tsx
git commit -m "feat(observability): integrate Sentry across client/server/edge runtimes"
```

---

## Phase 4: DevOps Pipeline

### Task 9: Dockerfile + docker-compose

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Modify: `next.config.ts` (`output: "standalone"`)

**Why:** PRODUCTION_READINESS_REPORT.md:69 — Docker 0/10. Self-host / lokal parite için. Dockerfile HEALTHCHECK Task 1'e bağlı.

- [ ] **Step 1: next.config.ts standalone**

`next.config.ts`'in `nextConfig` bloğuna ekle:

```typescript
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  output: "standalone",
  // ... mevcut images/headers
};
```

- [ ] **Step 2: .dockerignore yaz**

```
node_modules
.next
.env
.env.local
.env.*.local
.git
.github
docs
tests
playwright-report
test-results
*.md
!README.md
.vercel
.husky
```

- [ ] **Step 3: Dockerfile yaz**

```dockerfile
# Dockerfile
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

- [ ] **Step 4: docker-compose.yml yaz**

```yaml
# docker-compose.yml
services:
  web:
    build:
      context: .
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
        NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      SUPABASE_SECRET_KEY: ${SUPABASE_SECRET_KEY}
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
      NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}
      NOMINATIM_USER_AGENT: ${NOMINATIM_USER_AGENT}
      UPSTASH_REDIS_REST_URL: ${UPSTASH_REDIS_REST_URL}
      UPSTASH_REDIS_REST_TOKEN: ${UPSTASH_REDIS_REST_TOKEN}
      SENTRY_DSN: ${SENTRY_DSN}
      NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN}
    restart: unless-stopped
    healthcheck:
      test:
        ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 5: Build & smoke test**

Run: `docker compose build && docker compose up -d`
Run: `curl -fsS http://localhost:3000/api/health`
Expected: 200 + JSON body
Run: `docker compose down`

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml next.config.ts
git commit -m "feat(infra): add multi-stage Dockerfile + compose with health-checked image"
```

---

### Task 10: E2E testleri CI'a ekle

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `playwright.config.ts` (yoksa webServer ekle)

**Why:** PRODUCTION_READINESS_REPORT.md:67 — e2e CI'da çalışmıyor.

- [ ] **Step 1: playwright.config.ts'de webServer'ı doğrula**

`playwright.config.ts` içinde `webServer` ayarı yoksa veya `pnpm dev` kullanıyorsa şuna güncelle:

```typescript
webServer: {
  command: process.env.CI ? "pnpm start" : "pnpm dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
},
```

- [ ] **Step 2: ci.yml'e e2e job'u ekle**

`.github/workflows/ci.yml` içine `quality` job'undan sonra:

```yaml
e2e:
  name: E2E tests
  runs-on: ubuntu-latest
  needs: quality
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 10
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "pnpm"
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Install Playwright browsers
      run: pnpm exec playwright install --with-deps chromium
    - name: Build
      env:
        NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_dummy
        SUPABASE_SECRET_KEY: sb_secret_ci_dummy
        DATABASE_URL: postgresql://postgres:dummy@localhost:6543/postgres
        NEXT_PUBLIC_SITE_URL: http://localhost:3000
      run: pnpm build
    - name: Run e2e
      env:
        NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_dummy
        SUPABASE_SECRET_KEY: sb_secret_ci_dummy
        DATABASE_URL: postgresql://postgres:dummy@localhost:6543/postgres
        NEXT_PUBLIC_SITE_URL: http://localhost:3000
      run: pnpm test:e2e
    - name: Upload Playwright report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7
```

- [ ] **Step 3: Push & doğrula**

Branch push → "E2E tests" job geçmeli. Smoke (3) + Task 1 health (2) + Task 5 security (1) = 6 test minimum.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml playwright.config.ts
git commit -m "ci: add Playwright e2e job (build + run + report upload)"
```

---

### Task 11: CD pipeline (Vercel deploy + smoke test)

**Files:**

- Create: `.github/workflows/deploy.yml`
- Create: `docs/runbooks/deployment.md`

**Why:** PRODUCTION_READINESS_REPORT.md:67 — CI var ama CD yok. Manuel approval gate'li otomatik deploy.

- [ ] **Step 1: deploy.yml yaz**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    name: Vercel production deploy
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - name: Install Vercel CLI
        run: pnpm add -g vercel@latest
      - name: Pull Vercel env
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      - name: Build
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      - name: Deploy
        id: deploy
        run: |
          url=$(vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }})
          echo "url=$url" >> "$GITHUB_OUTPUT"
      - name: Smoke test (/api/health)
        run: |
          curl -fsS "${{ steps.deploy.outputs.url }}/api/health" | tee /tmp/health.json
          grep -q '"status":"ok"' /tmp/health.json
```

- [ ] **Step 2: Required secrets**

GitHub repo → Settings → Secrets and variables → Actions:

- `VERCEL_TOKEN` (vercel.com/account/tokens)
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (Vercel project Settings → General)

- [ ] **Step 3: GitHub environment "production" oluştur**

Settings → Environments → New environment → ad: `production` → Required reviewers: kendin.
Bu manuel approval gate; deploy job approval beklemeden başlamaz.

- [ ] **Step 4: Runbook yaz**

```markdown
# docs/runbooks/deployment.md

# Onside Production Deploy

## Otomatik akış (main → production)

1. PR merge'lendi → `Deploy` workflow tetiklenir
2. `production` environment manuel approval bekler (Required reviewers)
3. Approve → `vercel deploy --prod` → smoke test (`/api/health`)

## Manuel tetik (workflow_dispatch)

GitHub Actions → Deploy → Run workflow → branch = main

## Rollback

- Vercel dashboard → Deployments → istenen deploy → "Promote to Production"
- veya CLI: `vercel rollback <deployment-url> --token=$VERCEL_TOKEN`

## Smoke test başarısız olursa

- `/api/health` 503 → DB connectivity (Supabase status, DATABASE_URL)
- 5xx → Sentry "release" filtresinde yeni event'leri kontrol et
- Header eksik / CORS → CSP regression olabilir, `next.config.ts` diff'e bak
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml docs/runbooks/deployment.md
git commit -m "ci(cd): add Vercel deploy workflow with manual gate + smoke test"
```

---

### Task 12: Backup automation

**Files:**

- Create: `scripts/backup-db.mjs`
- Modify: `package.json` (script ekle)
- Create: `.github/workflows/backup.yml`
- Create: `docs/runbooks/backup-restore.md`

**Why:** PRODUCTION_READINESS_REPORT.md:74 — Backup scripti yok (1/10). Supabase Pro tier 7-gün PITR sağlar; bu off-site portable kopya.

- [ ] **Step 1: Backup script yaz**

```javascript
// scripts/backup-db.mjs
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname } from "node:path";

const exec = promisify(execFile);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.env.BACKUP_PATH ?? `./backups/onside-${stamp}.dump`;

await mkdir(dirname(out), { recursive: true });

console.log(`[backup] pg_dump → ${out}`);
const { stderr } = await exec("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  out,
  DATABASE_URL,
]);
if (stderr) console.warn(stderr);
console.log("[backup] done");
```

- [ ] **Step 2: package.json'a script ekle**

```json
"backup": "node scripts/backup-db.mjs"
```

- [ ] **Step 3: Lokal smoke test**

Run: `pnpm backup`
Expected: `./backups/onside-<stamp>.dump` oluşur, boyut > 0.

> **Not:** `pg_dump` lokalde kurulu olmalı. macOS: `brew install libpq`. Windows: PostgreSQL installer ile gelir.

- [ ] **Step 4: GitHub Actions cron yaz**

```yaml
# .github/workflows/backup.yml
name: DB backup

on:
  schedule:
    - cron: "0 2 * * *" # her gün 02:00 UTC
  workflow_dispatch:

jobs:
  dump:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pg client
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16
      - name: Run backup
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: node scripts/backup-db.mjs
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: backups/
          retention-days: 30
```

- [ ] **Step 5: Restore runbook**

Dosya: `docs/runbooks/backup-restore.md`

````markdown
# Backup & Restore

## Otomatik backup

- `.github/workflows/backup.yml` her gün 02:00 UTC
- Çıktı: GitHub Actions Artifacts (30 gün retention)
- Format: `pg_dump --format=custom`

## Manuel backup

```bash
DATABASE_URL=postgresql://... pnpm backup
```
````

## Restore

```bash
# Yeni boş bir DB'ye:
pg_restore --no-owner --no-privileges \
  --dbname="$NEW_DATABASE_URL" backups/onside-<stamp>.dump
```

## Sınırlar

- 30 gün > GitHub artifact retention. Daha uzun ihtiyaç için S3/R2 upload step ekle.
- Supabase Pro tier 7 gün PITR sağlar; bu workflow bağımsız off-site kopya.
- Disaster recovery genel akışı: `docs/runbooks/disaster-recovery.md`

````

- [ ] **Step 6: Commit**

```bash
git add scripts/backup-db.mjs package.json .github/workflows/backup.yml docs/runbooks/backup-restore.md
git commit -m "feat(ops): add nightly pg_dump backup workflow + restore runbook"
````

---

### Task 13: Lighthouse CI (perf regression)

**Files:**

- Create: `lighthouserc.json`
- Create: `.github/workflows/lighthouse.yml`

**Why:** PRODUCTION_READINESS_REPORT.md:126 — Lighthouse CI ile performance regression check.

- [ ] **Step 1: lighthouserc.json yaz**

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm start",
      "url": [
        "http://localhost:3000/tr",
        "http://localhost:3000/tr/events",
        "http://localhost:3000/tr/venues"
      ],
      "numberOfRuns": 3
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }],
        "uses-rel-preconnect": "off",
        "unused-javascript": "off"
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

- [ ] **Step 2: Workflow yaz**

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse

on:
  pull_request:
    branches: [main]

jobs:
  lhci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - name: Build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_dummy
          SUPABASE_SECRET_KEY: sb_secret_ci_dummy
          DATABASE_URL: postgresql://postgres:dummy@localhost:6543/postgres
          NEXT_PUBLIC_SITE_URL: http://localhost:3000
        run: pnpm build
      - name: Lighthouse CI
        run: |
          npm install -g @lhci/cli@0.14.x
          lhci autorun
```

- [ ] **Step 3: PR'da workflow başarılı mı doğrula**

PR aç → "Lighthouse" job geçmeli. Score raporu temporary public storage URL'inde.

- [ ] **Step 4: Commit**

```bash
git add lighthouserc.json .github/workflows/lighthouse.yml
git commit -m "ci(perf): add Lighthouse CI with perf/a11y thresholds"
```

---

## Self-Review (writing-plans skill gereği)

**Spec coverage** — PRODUCTION_READINESS_REPORT.md'deki her madde:

| Rapor                                                 | Plan                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| Sentry yok (kritik #1)                                | Task 8                                                               |
| Docker yok (kritik #2)                                | Task 9                                                               |
| Health endpoint yok (kritik #3)                       | Task 1                                                               |
| Playwright e2e CI'da yok (orta #4)                    | Task 10                                                              |
| Security headers (orta #5)                            | Task 5                                                               |
| Backup/DR (orta #6)                                   | Task 12                                                              |
| Upstash env aktif (orta #7)                           | Task 6                                                               |
| Lighthouse CI (düşük #8)                              | Task 13                                                              |
| Staging promotion (düşük #9)                          | Task 11 (deployment.md, workflow_dispatch + production env approval) |
| Global error boundary (Reviewer 1 zayıf yön)          | Task 2 + Task 3                                                      |
| Client-side React error handling                      | Task 2                                                               |
| `npm audit` yok (Reviewer 2)                          | Task 7                                                               |
| `not-found.tsx` (rapor explicit değil ama 404 UX gap) | Task 4                                                               |

Eksik bulunmadı.

**Placeholder scan** — TBD/TODO/etc. yok.

**Type consistency** — `dbStatus` literal union, Sentry imports, error.tsx props signature, JSON keys hep tutarlı.

---

## Riskler / Notlar

1. **CSP'nin maps + Supabase realtime ile uyumu (Task 5)** — `connect-src` listesini deploy sonrası browser console'unda doğrula. Eksik kalırsa harita tile'ları yüklenmez veya chat realtime kopar.
2. **Sentry SDK büyüklüğü (Task 8)** — Client bundle'a ~30 KB eklenir. Bundle analyzer ile baseline kıyasla; önemli artış varsa `widenClientFileUpload`'ı sıkılaştır.
3. **Vercel deploy + Sentry source-map upload** — `withSentryConfig` CI'da `SENTRY_AUTH_TOKEN` arar. Yoksa source-map yüklenmez ama build kırılmaz.
4. **Backup workflow GitHub artifact (Task 12)** — Free tier 500 MB; veri büyürse S3/R2 upload step'i ekle.
5. **Test sayısı tutarsızlığı (rapor)** — Rapor 25 elo testi diyor; dosyada 17 `test()` çağrısı var (rapor muhtemelen `expect()` veya nested describe sayıyor). Plan'ı etkilemez; rapor güncelleme tek-cümlelik bir TODO.
6. **`output: "standalone"` yan etkisi (Task 9)** — Vercel deploy'u etkilemez (Vercel kendi build target'ını kullanır), ama `pnpm build` çıktısı `.next/standalone/` içine taşınır. Vercel-only ekip etkilenmez.

---

## Execution Handoff

Plan tamamlandı, `docs/superpowers/plans/2026-05-03-production-readiness.md`'e kaydedildi.

**İki yürütme seçeneği:**

1. **Subagent-Driven (önerilen)** — Her task için fresh subagent dispatch, aralarda review, hızlı iterasyon. (`superpowers:subagent-driven-development`)
2. **Inline Execution** — Bu session'da batch'lerle checkpoint review. (`superpowers:executing-plans`)

Hangi yaklaşımı tercih edersin?
