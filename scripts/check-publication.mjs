import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: "require",
  prepare: false,
});

try {
  const tables = await sql`
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    ORDER BY tablename
  `;
  console.log("supabase_realtime publication tables:");
  for (const t of tables) console.log(`  ${t.schemaname}.${t.tablename}`);

  console.log("\nReplica identity:");
  const ri = await sql`
    SELECT n.nspname, c.relname,
      CASE c.relreplident
        WHEN 'd' THEN 'DEFAULT'
        WHEN 'n' THEN 'NOTHING'
        WHEN 'f' THEN 'FULL'
        WHEN 'i' THEN 'INDEX'
      END as identity
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname IN ('chat_message', 'event_participant', 'event')
    ORDER BY c.relname
  `;
  for (const r of ri) console.log(`  ${r.nspname}.${r.relname}: ${r.identity}`);
} finally {
  await sql.end();
}
