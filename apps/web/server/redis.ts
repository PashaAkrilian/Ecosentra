import "server-only"

type Command = (string | number)[]

/** Redis bersama (Upstash REST) bersifat opsional; tanpa env, semuanya tetap in-memory. */
export function redisEnabled() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

/** Jalankan beberapa perintah dalam satu round-trip; melempar kalau Redis gagal. */
export async function redisPipeline(commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  })
  if (!response.ok) throw new Error(`Redis mengembalikan status ${response.status}`)
  const results = (await response.json()) as { result?: unknown; error?: string }[]
  const failed = results.find((r) => r.error)
  if (failed) throw new Error(failed.error)
  return results.map((r) => r.result)
}
