# Backup & Restore

## Otomatik backup

- `.github/workflows/backup.yml` her gün 02:00 UTC
- Çıktı: GitHub Actions Artifacts (30 gün retention)
- Format: `pg_dump --format=custom`

## Manuel backup

```bash
DATABASE_URL=postgresql://... pnpm backup
```

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

## Yeni `DATABASE_URL` secret'ı kurulumu

GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

- `DATABASE_URL`: production Supabase connection string (URI form, sslmode=require)

⚠️ Read-only kullanıcı tercih edilir. Supabase Cloud → Database → Roles ile read-only role oluşturup connection string'ini kullanmak güvenlidir.

⚠️ **`pg_dump` Transaction pooler ile çalışmaz** (port 6543, `?pgbouncer=true` veya `pooler.supabase.com` host). Backup için **Session pooler** veya **Direct connection** kullan:

- Supabase Cloud → Project → Settings → Database → Connection string → "Session" tab → port 5432 URI
- Veya direct: `db.<project-ref>.supabase.co:5432`

Uygulamanın `DATABASE_URL`'i transaction pooler ise, backup için ayrı bir `BACKUP_DATABASE_URL` secret kullan ve `backup.yml`'i ona göre güncelle.
