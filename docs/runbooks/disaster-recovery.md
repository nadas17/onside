# Disaster Recovery Runbook

> Last updated: 2026-05-01

## Recovery objectives

| Metric                             | Target |
| ---------------------------------- | ------ |
| **RPO** (max acceptable data loss) | 24 h   |
| **RTO** (max acceptable downtime)  | 2 h    |

These are MVP-level targets. Tighten when paying customers + SLAs land.

## Backup layers

### 1. Supabase automated backups (primary)

- **Free tier**: daily snapshots, 7 days retention, restore via dashboard.
- **Pro tier ($25/mo)**: PITR (Point-in-Time Recovery) up to 7 days, 1-minute granularity.
- **Team tier**: 14 days PITR.

Restore path: Supabase Dashboard → Project → Database → Backups → Restore.

### 2. Manual SQL dumps (secondary, defense in depth)

Independent of Supabase tooling — survives provider outage / account compromise.

```bash
# Run on a trusted machine or scheduled GitHub Action
pg_dump "$DATABASE_URL" \
  --no-owner --no-acl \
  --format=custom \
  --file="onside-$(date +%Y%m%d).dump"

# Compress + upload to S3 (or any object store)
gzip onside-$(date +%Y%m%d).dump
aws s3 cp onside-$(date +%Y%m%d).dump.gz s3://onside-backups/
```

**Cadence**: weekly minimum, daily before any high-risk migration.
**Retention**: 4 weeks rolling + 1 monthly snapshot kept indefinitely for the first 12 months.

### 3. Migration files (tertiary, schema-only recovery)

`supabase/migrations/` is committed to git. Schema is reproducible from zero by replaying every numbered SQL file. Data is **not** recoverable from this layer — only structure.

## Failure scenarios

### Scenario A — Bad migration breaks production

**Symptoms**: app errors with SQL exceptions, RLS rejections, missing columns.

**Action**:

1. **Stop the bleeding**: roll back the offending migration if it has a documented `DROP` counterpart, or apply a hotfix migration that restores the prior shape.
2. **If no clean rollback exists**: restore from the most recent Supabase snapshot taken before the deployment. RPO will be ≤ snapshot age.
3. Post-mortem: write a follow-up migration that captures the corrective shape forward, never reverse the numbered sequence.

**Prevention**: every migration should be tested against a staging DB _before_ prod.
See [docs/runbooks/staging-setup.md](staging-setup.md).

### Scenario B — Supabase account compromised / locked out

**Symptoms**: cannot log into Supabase Dashboard, project unreachable.

**Action**:

1. Spin up a new Supabase project.
2. Replay all migrations: `for f in supabase/migrations/*.sql; do node --env-file=.env.local scripts/apply-migration.mjs "$f"; done`
3. Restore data from the latest manual dump (layer 2): `pg_restore -d "$NEW_DATABASE_URL" onside-YYYYMMDD.dump`
4. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` in Vercel.
5. Trigger a redeploy.

**RTO estimate** (today, manual): 2-4 hours assuming a recent dump exists. Without layer 2 dumps you depend entirely on Supabase support response.

### Scenario C — Vercel outage

**Symptoms**: app unreachable while Supabase is fine.

**Action**: short outage → wait it out (Vercel SLO is 99.9 %). Long outage → host the Next build on Cloudflare Pages or Render as a fallback. The app is fully portable; only the deployment target moves.

### Scenario D — Catastrophic data loss (deleted table, dropped DB)

**Symptoms**: rows missing across the board, queries return empty.

**Action**:

1. **Do not run further mutations** until the recovery decision is made.
2. Restore the most recent Supabase backup (Pro tier: PITR to ~minute before the loss).
3. If layer 2 dumps are fresher than Supabase snapshot, restore from dump instead.
4. Communicate to users: in-app banner + status page tweet.

## Quarterly drill

Once per quarter:

1. Spin up a throwaway Supabase project (free tier).
2. Replay migrations.
3. Restore the latest dump into it.
4. Verify a known event renders end-to-end.
5. Tear it down. Time the entire process — that's the realistic RTO.

Document the drill in `docs/runbooks/drills/YYYY-MM-DD-restore.md`.

## Pre-prod checklist (before first paying user)

- [ ] Supabase Pro tier (PITR enabled)
- [ ] Manual dump cron running (GitHub Actions weekly)
- [ ] Object storage retention policy set (4 weeks rolling + monthly archive)
- [ ] Staging environment configured (see [staging-setup.md](staging-setup.md))
- [ ] First DR drill completed and timed
- [ ] Supabase Auth recovery email set + 2FA enabled on the owner account
- [ ] Vercel team plan with multiple admins (avoid single-point-of-control)
