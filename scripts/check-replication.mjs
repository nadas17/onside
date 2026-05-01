import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: "require",
  prepare: false,
});

try {
  console.log("Replication slots:");
  const slots = await sql`
    SELECT slot_name, plugin, slot_type, active, confirmed_flush_lsn
    FROM pg_replication_slots
  `;
  for (const s of slots) console.log(" ", s);

  console.log("\nStat replication (active replicas):");
  const reps = await sql`
    SELECT application_name, state, sync_state, write_lag, replay_lag
    FROM pg_stat_replication
  `;
  for (const r of reps) console.log(" ", r);

  console.log("\nMessage count by event:");
  const counts = await sql`
    SELECT event_id, count(*)::int as n, max(created_at) as latest
    FROM public.chat_message
    GROUP BY event_id
    ORDER BY latest DESC
    LIMIT 5
  `;
  for (const c of counts) console.log(" ", c);
} finally {
  await sql.end();
}
