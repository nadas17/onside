import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let dbStatus: "ok" | "skipped" | "error" = "skipped";
  try {
    await db.execute(sql`SELECT 1`);
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
