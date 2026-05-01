/**
 * Migration apply script (Phase 1 köprü tool'u).
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/apply-migration.mjs <migration-file>
 *
 * Drizzle generate kullanmadığımız için (RLS + helper SQL manuel) doğrudan
 * postgres bağlantısı ile migration dosyasını çalıştırır.
 */

import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { argv } from "node:process";
import path from "node:path";

const file = argv[2] ?? "supabase/migrations/0001_profile_init.sql";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "✗ DATABASE_URL ortam değişkeni boş. .env.local kontrolü gerekli.",
  );
  process.exit(1);
}

console.log(`▸ Migration: ${path.basename(file)}`);

const sql = postgres(url, {
  max: 1,
  ssl: "require",
  prepare: false,
});

try {
  const migration = await readFile(file, "utf-8");
  console.log("▸ Uygulanıyor…");

  await sql.unsafe(migration);
  console.log("✓ Migration başarıyla uygulandı");

  // Verify
  const [{ exists }] = await sql`
    SELECT to_regclass('public.profile') IS NOT NULL AS exists
  `;
  console.log(`✓ public.profile tablosu mevcut: ${exists}`);

  const enums = await sql`
    SELECT typname FROM pg_type
    WHERE typname IN ('position', 'skill_level') AND typtype = 'e'
    ORDER BY typname
  `;
  console.log(`✓ Enum'lar: ${enums.map((e) => e.typname).join(", ")}`);

  const policies = await sql`
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.profile'::regclass
    ORDER BY polname
  `;
  console.log(`✓ RLS policies: ${policies.map((p) => p.polname).join(", ")}`);

  const helper = await sql`
    SELECT proname FROM pg_proc
    WHERE proname = 'auth_user_active' AND pronamespace = 'public'::regnamespace
  `;
  console.log(
    `✓ auth_user_active helper: ${helper.length > 0 ? "var" : "YOK"}`,
  );
} catch (err) {
  console.error("✗ Hata:", err.message);
  if (err.code) console.error(`  PG code: ${err.code}`);
  if (err.detail) console.error(`  Detay: ${err.detail}`);
  process.exit(1);
} finally {
  await sql.end();
}
