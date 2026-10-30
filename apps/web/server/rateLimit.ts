import "server-only"
import { getClientIp, HttpError } from "@/server/http"
import { redisEnabled, redisPipeline } from "@/server/redis"

interface Hits {
  times: number[]
  windowMs: number
}

const hits = new Map<string, Hits>()
const MAX_KEYS = 10_000

function checkMemory(key: string, limit: number, windowMs: number, now: number) {
  const windowStart = now - windowMs
  const recent = (hits.get(key)?.times ?? []).filter((t) => t > windowStart)

  if (recent.length >= limit) {
    hits.set(key, { times: recent, windowMs })
    const retryAfterMs = recent[0]! + windowMs - now
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  recent.push(now)
  hits.delete(key) // set ulang supaya urutan sisip = urutan pemakaian terakhir
  hits.set(key, { times: recent, windowMs })

  if (hits.size > MAX_KEYS) {
    for (const [k, h] of hits) {
      if (h.times.every((t) => t <= now - h.windowMs)) hits.delete(k)
    }
    if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value!)
  }

  return { allowed: true, retryAfterSeconds: 0 }
}

/** Fixed-window di Redis bersama: satu round-trip (INCR, EXPIRE NX, TTL). */
async function checkRedis(key: string, limit: number, windowMs: number) {
  const k = `rl:${key}`
  const [count, , ttl] = await redisPipeline([["INCR", k], ["EXPIRE", k, Math.ceil(windowMs / 1000), "NX"], ["TTL", k]])
  return { allowed: (count as number) <= limit, retryAfterSeconds: Math.max(1, Number(ttl)) }
}

/**
 * Rate limit per kunci. Dengan Redis (UPSTASH_REDIS_REST_*) batasnya berlaku lintas
 * instance (fixed-window); tanpa itu, atau bila Redis gagal, sliding-window in-memory
 * per instance — jaring pengaman awal, bukan pertahanan anti-abuse yang kuat.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (redisEnabled()) {
    try {
      return await checkRedis(key, limit, windowMs)
    } catch (error) {
      console.warn("rateLimit: Redis gagal, memakai batas lokal:", error instanceof Error ? error.message : error)
    }
  }
  return checkMemory(key, limit, windowMs, now)
}

/** Lempar HTTP 429 kalau IP klien melewati `limit` request per `windowMs` untuk `bucket` ini. */
export async function enforceRateLimit(request: Request, bucket: string, limit: number, windowMs: number) {
  const { allowed, retryAfterSeconds } = await checkRateLimit(`${bucket}:${getClientIp(request)}`, limit, windowMs)
  if (!allowed) {
    throw new HttpError(429, `Terlalu banyak permintaan. Coba lagi dalam ${retryAfterSeconds} detik.`, {
      "Retry-After": String(retryAfterSeconds),
    })
  }
}

/** Hanya untuk test. */
export function resetRateLimits() {
  hits.clear()
}
