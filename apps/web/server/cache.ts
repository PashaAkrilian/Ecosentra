import "server-only"
import { after } from "next/server"
import { redisEnabled, redisPipeline } from "@/server/redis"

interface Entry<T> {
  value?: T
  /** Nilai dianggap segar sampai waktu ini. */
  expiresAt: number
  /** Setelah ini nilai terlalu basi dan tidak boleh disajikan lagi. */
  staleUntil: number
  inflight?: Promise<T>
}

const store = new Map<string, Entry<unknown>>()
// Kunci memuat koordinat dari pengguna; tanpa batas, proses berumur panjang bisa membengkak.
const MAX_ENTRIES = 500

/** Tulis entri sebagai yang terbaru; di atas batas, buang yang tertua (kecuali yang sedang dimuat). */
function put(key: string, entry: Entry<unknown>) {
  store.delete(key)
  store.set(key, entry)
  if (store.size <= MAX_ENTRIES) return
  for (const [k, e] of store) {
    if (!e.inflight) {
      store.delete(k)
      break
    }
  }
}

/** Kerja latar belakang yang tetap hidup di serverless; di luar request (instrumentation, test) promise sudah jalan sendiri. */
function inBackground(work: Promise<unknown>) {
  try {
    after(work)
  } catch {
    /* di luar request scope */
  }
}

// Tingkat 2 (Redis bersama antar instance): shortcut: tanpa lock lintas instance, dua instance dingin
// bisa memuat sumber bersamaan; tambahkan SET NX kalau beban sumber jadi masalah.
async function sharedGet<T>(key: string): Promise<{ value: T; storedAt: number } | undefined> {
  try {
    const [raw] = await redisPipeline([["GET", `cache:${key}`]])
    return typeof raw === "string" ? JSON.parse(raw) : undefined
  } catch (error) {
    console.warn(`cache[${key}]: Redis gagal dibaca:`, error instanceof Error ? error.message : error)
  }
}

async function sharedSet(key: string, value: unknown, ttlMs: number) {
  try {
    const payload = JSON.stringify({ value, storedAt: Date.now() })
    await redisPipeline([["SET", `cache:${key}`, payload, "EX", Math.ceil(ttlMs / 1000)]])
  } catch (error) {
    console.warn(`cache[${key}]: Redis gagal ditulis:`, error instanceof Error ? error.message : error)
  }
}

export interface CacheOptions {
  /**
   * Berapa lama nilai kedaluwarsa masih boleh disajikan sambil diperbarui di
   * latar belakang (stale-while-revalidate). Default: 6x TTL.
   */
  staleMs?: number
}

/**
 * Memoize hasil `loader` per `key` selama `ttlMs`, in-memory per instance.
 *
 * - Request bersamaan untuk key yang sama berbagi satu panggilan `loader`.
 * - **Stale-while-revalidate**: nilai yang sudah lewat TTL tapi belum lewat
 *   `staleMs` langsung disajikan, dan pembaruan berjalan di latar belakang.
 *   Pengguna jadi tidak menunggu sumber eksternal yang lambat (CSV FIRMS
 *   butuh 5-60 detik dari Indonesia) setelah panggilan pertama.
 * - Kalau pembaruan gagal tapi masih ada nilai lama, nilai lama dipakai dan
 *   percobaan ulang dijadwalkan dalam ≤ 60 detik.
 *
 * Dipakai alih-alih fetch cache Next.js karena beberapa sumber melewati batas
 * 2 MB data cache Next, dan yang disimpan di sini adalah hasil yang sudah
 * diparsing & difilter (jauh lebih kecil).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  { staleMs = ttlMs * 6 }: CacheOptions = {},
): Promise<T> {
  let entry = store.get(key) as Entry<T> | undefined

  if (!entry && redisEnabled()) {
    const shared = await sharedGet<T>(key)
    if (shared) {
      entry = {
        value: shared.value,
        expiresAt: shared.storedAt + ttlMs,
        staleUntil: shared.storedAt + ttlMs + staleMs,
      }
      put(key, entry)
    }
  }

  const now = Date.now()
  if (entry?.value !== undefined && entry.expiresAt > now) return entry.value

  const refresh = () => {
    const current = store.get(key) as Entry<T> | undefined
    if (current?.inflight) return current.inflight

    const inflight = loader()
      .then(async (value) => {
        put(key, { value, expiresAt: Date.now() + ttlMs, staleUntil: Date.now() + ttlMs + staleMs })
        if (redisEnabled()) await sharedSet(key, value, ttlMs + staleMs)
        return value
      })
      .catch((error: unknown) => {
        const previous = store.get(key) as Entry<T> | undefined
        if (previous?.value !== undefined && previous.staleUntil > Date.now()) {
          console.warn(`cache[${key}]: sumber gagal, memakai data lama:`, error instanceof Error ? error.message : error)
          put(key, {
            value: previous.value,
            expiresAt: Date.now() + Math.min(ttlMs, 60_000),
            staleUntil: previous.staleUntil,
          })
          return previous.value
        }
        store.delete(key)
        throw error
      })

    put(key, {
      value: current?.value,
      expiresAt: current?.expiresAt ?? 0,
      staleUntil: current?.staleUntil ?? 0,
      inflight,
    })
    return inflight
  }

  // Basi tapi masih layak: sajikan sekarang, perbarui diam-diam.
  if (entry?.value !== undefined && entry.staleUntil > now) {
    inBackground(refresh().catch(() => undefined))
    return entry.value
  }

  return refresh()
}

/** Hanya untuk test. */
export function clearCache() {
  store.clear()
}
