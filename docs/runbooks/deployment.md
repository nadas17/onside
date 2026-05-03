# Onside Production Deploy

## Otomatik akış (main → production)

1. PR merge'lendi → `Deploy` workflow tetiklenir
2. `production` environment manuel approval bekler (Required reviewers)
3. Approve → `vercel deploy --prod` → smoke test (`/api/health`)

## Manuel tetik (workflow_dispatch)

GitHub Actions → Deploy → Run workflow → branch = main

## İlk kurulum (bir kez yapılır)

### 1. GitHub secrets

Settings → Secrets and variables → Actions → New repository secret:

- `VERCEL_TOKEN` (vercel.com/account/tokens)
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (Vercel project Settings → General)

### 2. GitHub environment

Settings → Environments → New environment → name: `production`
→ Required reviewers: kendin (veya release ekibi)

Bu manuel approval gate'i; deploy job approval beklemeden başlamaz.

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
