# Staging Environment Setup

> Last updated: 2026-05-01

## Why a separate staging project

Production and dev currently share a single Supabase project. Every migration applied locally hits prod immediately; every schema change is one typo from a customer-visible incident. A separate staging project breaks this coupling.

A staging project also unblocks:

- Realistic migration rehearsals (full replay of `supabase/migrations/*.sql`)
- Integration tests with real RLS policies (mocking RLS in unit tests is insufficient)
- Realtime publication verification at scale
- E2E tests (Playwright) running against a non-prod instance

## Option A — Supabase Branching (recommended for Pro plan)

Supabase Branching lets you spawn a copy of the prod schema (no data) on a per-branch basis, on demand.

```bash
# Once per repo
supabase link --project-ref <prod-ref>

# Per feature branch
supabase branches create feature/xyz
# auto-applies pending migrations
```

Pros: zero-ops; integrates with GitHub PRs (preview branch URL).
Cons: Pro tier required ($25/mo); ephemeral data (gets discarded on merge).

## Option B — Standalone staging project (Free tier)

A second Supabase project that lives alongside prod, refreshed manually.

### One-time setup

1. **Create the project**
   - Supabase Dashboard → New project
   - Name: `onside-staging`
   - Region: same as prod (`eu-central-1`)
   - Save the password somewhere safe

2. **Pull the credentials**
   - Settings → API → URL + Publishable key + Secret key
   - Settings → Database → Connection string (Transaction pooler, port 6543)

3. **Replay migrations**

   ```bash
   # Use a separate .env.staging file (do NOT commit)
   cat > .env.staging <<EOF
   DATABASE_URL=postgresql://postgres:STAGING_PASSWORD@HOST:6543/postgres?sslmode=require
   NEXT_PUBLIC_SUPABASE_URL=https://STAGING-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_STAGING_KEY
   SUPABASE_SECRET_KEY=sb_secret_STAGING_KEY
   NEXT_PUBLIC_SITE_URL=https://onside-staging.vercel.app
   EOF

   # Replay every migration in order
   for f in supabase/migrations/*.sql; do
     node --env-file=.env.staging scripts/apply-migration.mjs "$f"
   done

   # Seed venues
   node --env-file=.env.staging scripts/seed-venues.mjs
   ```

4. **Enable anonymous auth**
   - Authentication → Providers → Anonymous Sign-Ins → Enable

5. **Verify Realtime publication**
   - SQL Editor → Database → Replication → confirm all 8 tables in `supabase_realtime` publication
   - Or run `node --env-file=.env.staging scripts/check-publication.mjs`

### Per-PR workflow

```bash
# Apply only the new migration(s) introduced by the PR
node --env-file=.env.staging scripts/apply-migration.mjs supabase/migrations/00XX_new.sql

# Run smoke test against staging
NEXT_PUBLIC_SITE_URL=https://onside-staging.vercel.app pnpm test:e2e   # once Playwright is wired
```

### Vercel preview environment

Connect the staging project to a Vercel preview branch (e.g. `staging`):

1. Vercel → Project → Settings → Environment Variables → **Preview** scope
2. Add the `_STAGING` variables under the **Preview** environment
3. Push to the `staging` branch → Vercel deploys against staging Supabase

## Promoting a migration to prod

1. ✅ Migration tested locally
2. ✅ Migration applied to staging via `apply-migration.mjs`
3. ✅ Smoke test passes against staging
4. ✅ Schema diff check (`pnpm db:check`) confirms no drift
5. ✅ PR reviewed + merged to `main`
6. Apply the same migration to prod via `apply-migration.mjs` against the prod `DATABASE_URL`
7. Watch Sentry / Supabase logs for the next 30 minutes

## Common pitfalls

- **Anonymous auth not enabled** on staging → JoinModal silently fails with a 4xx
- **Different Realtime publication membership** → chat / roster updates don't broadcast
- **Region mismatch** between prod and staging → cold-start latency affects E2E test timings
- **Forgetting to seed venues** → empty map on staging, false-negative for "broken map"
