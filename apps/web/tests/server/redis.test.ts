import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cached, clearCache } from "@/server/cache"
import { checkRateLimit, resetRateLimits } from "@/server/rateLimit"

// Redis palsu: menangani pipeline GET/SET/INCR/EXPIRE/TTL di satu Map.
function fakeRedis() {
  const data = new Map<string, string | number>()
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const commands = JSON.parse(String(init?.body)) as (string | number)[][]
    const out = commands.map(([cmd, key, value]) => {
      const k = String(key)
      switch (cmd) {
        case "GET":
          return { result: data.get(k) ?? null }
        case "SET":
          data.set(k, value as string)
          return { result: "OK" }
        case "INCR":
          data.set(k, Number(data.get(k) ?? 0) + 1)
          return { result: data.get(k) }
        case "EXPIRE":
          return { result: 1 }
        default:
          return { result: 60 } // TTL
      }
    })
    return new Response(JSON.stringify(out))
  })
  vi.stubGlobal("fetch", fetchMock)
  return { data, fetchMock }
}

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  clearCache()
  resetRateLimits()
})

describe("cache dengan Redis", () => {
  it("instance dingin memakai nilai dari Redis tanpa memanggil loader", async () => {
    const { data } = fakeRedis()
    data.set("cache:k", JSON.stringify({ value: "dari-redis", storedAt: Date.now() }))
    const loader = vi.fn(async () => "baru")
    expect(await cached("k", 60_000, loader)).toBe("dari-redis")
    expect(loader).not.toHaveBeenCalled()
  })

  it("menulis hasil loader ke Redis", async () => {
    const { data } = fakeRedis()
    await cached("k2", 60_000, async () => "hasil")
    expect(JSON.parse(data.get("cache:k2") as string).value).toBe("hasil")
  })

  it("Redis gagal tidak mematahkan cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })))
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(await cached("k3", 60_000, async () => "lokal")).toBe("lokal")
  })
})

describe("rate limit dengan Redis", () => {
  it("menolak setelah melewati batas lintas pemanggil", async () => {
    fakeRedis()
    expect((await checkRateLimit("a", 2, 60_000)).allowed).toBe(true)
    expect((await checkRateLimit("a", 2, 60_000)).allowed).toBe(true)
    const third = await checkRateLimit("a", 2, 60_000)
    expect(third).toEqual({ allowed: false, retryAfterSeconds: 60 })
  })

  it("Redis gagal: jatuh ke batas lokal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })))
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect((await checkRateLimit("b", 1, 60_000)).allowed).toBe(true)
    expect((await checkRateLimit("b", 1, 60_000)).allowed).toBe(false)
  })
})

describe("batas ukuran", () => {
  it("cache lokal membuang entri tertua di atas 500 kunci", async () => {
    vi.unstubAllEnvs()
    const loader = vi.fn(async () => "v")
    for (let i = 0; i < 501; i++) await cached(`bound:${i}`, 60_000, loader)
    await cached("bound:0", 60_000, loader) // sudah dibuang -> dimuat ulang
    expect(loader).toHaveBeenCalledTimes(502)
  })
})
