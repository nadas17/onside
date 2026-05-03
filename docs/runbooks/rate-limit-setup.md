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
