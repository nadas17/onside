import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_PROBE_TIMEOUT_MS = 3_000;

export async function GET() {
  let dbStatus: "ok" | "skipped" | "error" = "skipped";
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("db probe timeout")),
        DB_PROBE_TIMEOUT_MS,
      ),
    );
    await Promise.race([db.execute(sql`SELECT 1`), timeout]);
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
