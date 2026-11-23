import { CreateBucketCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { beforeAll, describe, expect, it } from "vitest"

/**
 * Uji integrasi server/exportStore.ts terhadap S3 emulator (Moto). Dilewati otomatis kalau S3_ENDPOINT
 * tidak di-set / tidak terjangkau.   moto_server -p 5555 ; S3_ENDPOINT=http://127.0.0.1:5555 npm run test:emulator
 */
const ENDPOINT = process.env.S3_ENDPOINT
const BUCKET = `ecosentra-exports-it-${Date.now()}`

async function reachable(): Promise<boolean> {
  if (!ENDPOINT) return false
  try {
    await fetch(ENDPOINT, { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

describe.skipIf(!(await reachable()))("exportStore.ts terhadap S3 (emulator)", () => {
  let exportStore: typeof import("@/server/exportStore")

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID ??= "test"
    process.env.AWS_SECRET_ACCESS_KEY ??= "test"
    process.env.AWS_REGION = "ap-southeast-2"
    await new S3Client({ region: "ap-southeast-2", endpoint: ENDPOINT, forcePathStyle: true }).send(
      new CreateBucketCommand({ Bucket: BUCKET, CreateBucketConfiguration: { LocationConstraint: "ap-southeast-2" } }),
    )
    exportStore = await import("@/server/exportStore")
  })

  it("exportBucket membaca env", () => {
    delete process.env.EXPORT_BUCKET
    expect(exportStore.exportBucket()).toBeNull()
    process.env.EXPORT_BUCKET = BUCKET
    expect(exportStore.exportBucket()).toBe(BUCKET)
    delete process.env.EXPORT_BUCKET
  })

  it("mengunggah berkas dan menghasilkan URL unduhan yang memaksa nama & jenis berkas", async () => {
    const body = "latitude,longitude\n-3.4,114.8\n"
    const url = await exportStore.storeExport(BUCKET, "titik-api_24h_2026-11-24.csv", "text/csv; charset=utf-8", body)

    expect(url).toContain("X-Amz-Signature=")
    expect(url).toMatch(/X-Amz-Expires=300/)
    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="titik-api_24h_2026-11-24.csv"')
    expect(response.headers.get("content-type")).toContain("text/csv")
  })

  it("kunci objek acak dan di bawah awalan exports/ (tidak bisa ditebak, bisa dikenai lifecycle)", async () => {
    const a = await exportStore.storeExport(BUCKET, "a.csv", "text/csv", "1")
    const b = await exportStore.storeExport(BUCKET, "a.csv", "text/csv", "1")
    const key = (u: string) => decodeURIComponent(new URL(u).pathname.split(`/${BUCKET}/`)[1]!)
    expect(key(a)).toMatch(/^exports\/\d+-[0-9a-f]{8}\/a\.csv$/)
    expect(key(a)).not.toBe(key(b))
  })

  it("objek yang diunggah memang ada di bucket", async () => {
    const url = await exportStore.storeExport(BUCKET, "cek.geojson", "application/geo+json", "{}")
    const key = decodeURIComponent(new URL(url).pathname.split(`/${BUCKET}/`)[1]!)
    const out = await new S3Client({ region: "ap-southeast-2", endpoint: ENDPOINT, forcePathStyle: true }).send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    expect(await out.Body!.transformToString()).toBe("{}")
  })
})
