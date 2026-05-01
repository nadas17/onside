/**
 * Rate limiter — Upstash Redis if env present, in-memory Map fallback.
 *
 * Upstash branch:
 *   - REST API üzerinden çalışır → Vercel edge / Node serverless'ta tutarlı
 *   - Atomic INCR + EXPIRE; horizontal scale'de kayıp yok
 *   - `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN` zorunlu
 *
 * In-memory branch:
 *   - Per-process Map; serverless cold-start'ta sıfırlanır
 *   - Single-instance dev / staging için yeterli
 *   - Production'da scale'de kayıp riski → Upstash önerilir
 *
 * Senkron API: `rateLimit()` return tipi her iki branch'te aynı.
 *   - Upstash branch async; çağıran tarafta `await` gerekli
 *   - In-memory branch sync; aynı return tipini Promise olarak sarmalar
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number };

function rateLimitInMemory(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  if (bucket.count >= max) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: max - bucket.count,
    resetAt: bucket.resetAt,
  };
}

async function rateLimitUpstash(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSec = Math.max(1, Math.floor(windowMs / 1000));
  const ttl = windowSec;
  const redisKey = `rl:${key}`;

  // Atomic pipeline: INCR + EXPIRE NX (TTL sadece ilk INCR'da set)
  // Ref: https://upstash.com/docs/redis/features/restapi
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, ttl, "NX"],
      ["PTTL", redisKey],
    ]),
    cache: "no-store",
  });

  if (!res.ok) {
    // Upstash unreachable → fallback in-memory (gracefully degrade, no hard fail)
    console.error("[rate-limit] Upstash unreachable, falling back in-memory");
    return rateLimitInMemory(key, max, windowMs);
  }

  const body = (await res.json()) as Array<{ result: number | string }>;
  const count = Number(body[0]?.result ?? 0);
  const pttl = Number(body[2]?.result ?? windowMs);
  const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs);

  if (count > max) {
    return { allowed: false, remaining: 0, resetAt };
  }
  return { allowed: true, remaining: max - count, resetAt };
}

/**
 * Per-key rate limit. Upstash present → async distributed; aksi takdirde sync in-memory.
 * Çağıran taraf her iki durumda `await` etmeli (Promise.resolve sync sonucu sarmalar).
 */
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (useUpstash) {
    return rateLimitUpstash(key, max, windowMs);
  }
  return rateLimitInMemory(key, max, windowMs);
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
