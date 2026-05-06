# Onside Production Deploy

## Otomatik akış (main → production)

1. `main`'e push → `Deploy` workflow tetiklenir
2. `vercel deploy --prod` → alias promote (`onside-boisko.vercel.app`) → smoke (`/api/health`)

> Required reviewer kapısı kaldırıldı (2026-05-06) — küçük fix'lerin
> deploy'u beklemesin diye. Smoke test + alias kontrolü hâlâ var.
> Riskli bir release öncesinde geçici olarak yeniden eklenebilir:
> `gh api -X PUT repos/nadas17/onside/environments/Production --input -`
> body: `{"reviewers":[{"type":"User","reviewer_id":147252135}]}`

## Manuel tetik (workflow_dispatch)

GitHub Actions → Deploy → Run workflow → branch = main

## İlk kurulum (bir kez yapılır)

### 1. GitHub secrets

Settings → Secrets and variables → Actions → New repository secret:

- `VERCEL_TOKEN` (vercel.com/account/tokens)
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (Vercel project Settings → General)
- `SENTRY_AUTH_TOKEN` (Sentry → Settings → Auth Tokens; needed for CI source-map upload)

### 2. GitHub environment

Settings → Environments → New environment → name: `production`
→ Required reviewers: kendin (veya release ekibi)

Bu manuel approval gate'i; deploy job approval beklemeden başlamaz.

### 3. Supabase Auth ayarları

Authentication → Providers (veya Settings → Auth) altında:

- **Google provider** enable + Client ID / Secret girilmiş olmalı (yoksa
  "Continue with Google" butonu Supabase'den hata döner).
- **Manual linking** toggle açık olmalı. Aksi halde anon kullanıcının
  profile sayfasındaki "Connect with Google" CTA'sı `supabase.auth.linkIdentity`
  çağrısında "Session not found" / `manual_linking_disabled` döner.
- **Site URL** = production domain (`https://onside-boisko.vercel.app`),
  **Additional Redirect URLs** = aynı + preview deploy pattern (örn.
  `https://onside-*.vercel.app/**`). OAuth callback URL'leri buraya da
  eklenmezse Google login redirect_uri_mismatch verir.

## Rollback

- Vercel dashboard → Deployments → istenen deploy → "Promote to Production"
- veya CLI: `vercel rollback <deployment-url> --token=$VERCEL_TOKEN`

## Smoke test başarısız olursa

- `/api/health` 503 → DB connectivity (Supabase status, DATABASE_URL secret)
- 5xx → Sentry'de yeni "release" event'lerini kontrol et
- Header eksik / CSP ihlali → `next.config.ts` diff'e bak (Task 5 + Sentry wrap)

## Bağımlılıklar

- `/api/health` endpoint (Task 1) — smoke test buna bağlı
- `production` environment + 3 secret (yukarıda)
- Vercel project'in `main` branch'ten otomatik preview deploy etmesi DEVAM eder; bu workflow ek bir "production" deploy'u tetikler. Çift-deploy istenmiyorsa Vercel project Settings → Git → "Production branch" pasif edilebilir.
