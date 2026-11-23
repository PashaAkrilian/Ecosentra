import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Uji integrasi server/store.ts terhadap DynamoDB sungguhan (emulator: Moto atau DynamoDB Local).
 * Dilewati otomatis kalau DYNAMODB_ENDPOINT tidak di-set / tidak terjangkau, jadi `npm test` biasa tetap hijau.
 *
 * Jalankan:  moto_server -p 5555   lalu
 *            DYNAMODB_ENDPOINT=http://127.0.0.1:5555 npm run test:emulator
 */
const ENDPOINT = process.env.DYNAMODB_ENDPOINT
const TABLE = `ecosentra-it-${Date.now()}`

async function reachable(): Promise<boolean> {
  if (!ENDPOINT) return false
  try {
    await fetch(ENDPOINT, { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

const available = await reachable()

describe.skipIf(!available)("store.ts terhadap DynamoDB (emulator)", () => {
  let store: typeof import("@/server/store")
  let http: typeof import("@/server/http")

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID ??= "test"
    process.env.AWS_SECRET_ACCESS_KEY ??= "test"
    process.env.AWS_REGION = "ap-southeast-2"
    process.env.DYNAMODB_TABLE = TABLE
    // Definisi tabel yang sama dengan produksi (lihat docs/aws-deployment.md).
    await new DynamoDBClient({ region: "ap-southeast-2", endpoint: ENDPOINT }).send(
      new CreateTableCommand({
        TableName: TABLE,
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    )
    store = await import("@/server/store")
    http = await import("@/server/http")
  })

  afterAll(() => {
    delete process.env.DYNAMODB_TABLE
  })

  const rejects404 = async (promise: Promise<unknown>) => {
    const error = await promise.then(() => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(http.HttpError)
    expect((error as InstanceType<typeof http.HttpError>).status).toBe(404)
  }

  it("membuat, membaca, memperbarui, dan menghapus dokumen milik sendiri", async () => {
    const created = await store.createOwned<{ id: string; name: string; createdAt: string; updatedAt: string }>("fields", "u1", { name: "Sawah" })
    expect(created).toMatchObject({ name: "Sawah" })
    expect(created).not.toHaveProperty("pk")
    expect(created).not.toHaveProperty("sk")
    expect(created.createdAt).toBe(created.updatedAt)

    expect(await store.getOwned("fields", created.id, "u1")).toMatchObject({ id: created.id, name: "Sawah" })

    const updated = await store.updateOwned<{ name: string; areaHa: number; createdAt: string; updatedAt: string }>("fields", created.id, "u1", { name: "Sawah 2", areaHa: 3 })
    expect(updated).toMatchObject({ name: "Sawah 2", areaHa: 3, createdAt: created.createdAt })
    expect(updated.updatedAt > created.updatedAt).toBe(true)

    await store.deleteOwned("fields", created.id, "u1")
    await rejects404(store.getOwned("fields", created.id, "u1"))
  })

  it("mengisolasi data antar pengguna: milik orang lain = 404, tidak bisa dibaca/diubah/dihapus", async () => {
    const { id } = await store.createOwned<{ id: string }>("fields", "alice", { name: "Milik Alice" })
    await rejects404(store.getOwned("fields", id, "bob"))
    await rejects404(store.updateOwned("fields", id, "bob", { name: "dibajak" }))
    await rejects404(store.deleteOwned("fields", id, "bob"))
    expect(await store.listOwned("fields", "bob")).toEqual([])
    expect(await store.getOwned("fields", id, "alice")).toMatchObject({ name: "Milik Alice" })
  })

  it("koleksi berbeda tidak tercampur walau id sama", async () => {
    const f = await store.createOwned<{ id: string }>("fields", "u2", { name: "lahan" })
    await rejects404(store.getOwned("decisions", f.id, "u2"))
    expect(await store.listOwned("decisions", "u2")).toEqual([])
  })

  it("daftar diurutkan terbaru dulu dan menerapkan filter atribut", async () => {
    const a = await store.createOwned<{ id: string }>("landCoverSnapshots", "u3", { fieldId: "F1" })
    const b = await store.createOwned<{ id: string }>("landCoverSnapshots", "u3", { fieldId: "F2" })
    const c = await store.createOwned<{ id: string }>("landCoverSnapshots", "u3", { fieldId: "F1" })
    expect((await store.listOwned<{ id: string }>("landCoverSnapshots", "u3")).map((x) => x.id)).toEqual([c.id, b.id, a.id])
    expect((await store.listOwned<{ id: string }>("landCoverSnapshots", "u3", { fieldId: "F1" })).map((x) => x.id)).toEqual([c.id, a.id])
  })

  it("update/delete dokumen yang tidak ada = 404, id berbahaya ditolak", async () => {
    await rejects404(store.updateOwned("fields", "tidak-ada", "u4", { name: "x" }))
    await rejects404(store.deleteOwned("fields", "tidak-ada", "u4"))
    await rejects404(store.getOwned("fields", "a/b", "u4"))
    await rejects404(store.getOwned("fields", "", "u4"))
    await rejects404(store.getOwned("fields", "x".repeat(201), "u4"))
  })

  it("menyimpan nilai null dan objek bersarang apa adanya", async () => {
    const f = await store.createOwned<{ id: string }>("fields", "u5", { name: "n", lastAnalysis: null, location: { lat: -6.5, lng: 107.7 } })
    expect(await store.getOwned("fields", f.id, "u5")).toMatchObject({ lastAnalysis: null, location: { lat: -6.5, lng: 107.7 } })
    const patched = await store.updateOwned("fields", f.id, "u5", { lastAnalysis: { dominantClass: "Pepohonan" } })
    expect(patched).toMatchObject({ lastAnalysis: { dominantClass: "Pepohonan" } })
  })

  it("deleteAllOwned menghapus semua milik satu pengguna (lebih dari satu batch) tanpa menyentuh pengguna lain", async () => {
    for (let i = 0; i < 60; i++) await store.createOwned("decisions", "u6", { title: `s${i}` })
    await store.createOwned("decisions", "u7", { title: "milik u7" })
    expect(await store.deleteAllOwned("decisions", "u6")).toBe(60)
    expect(await store.listOwned("decisions", "u6")).toEqual([])
    expect(await store.listOwned("decisions", "u7")).toHaveLength(1)
    expect(await store.deleteAllOwned("decisions", "u6")).toBe(0)
  })

  it("daftar dibatasi 200 dokumen", async () => {
    for (let i = 0; i < 205; i++) await store.createOwned("fields", "u8", { name: `f${i}` })
    expect(await store.listOwned("fields", "u8")).toHaveLength(200)
  }, 60_000)

  it("profil: simpan sebagian (merge), baca, hapus", async () => {
    expect(await store.getProfile("p1")).toBeUndefined()
    await store.saveProfile("p1", { displayName: "A", email: "a@b.co" })
    await store.saveProfile("p1", { organization: "KLHK" })
    expect(await store.getProfile("p1")).toMatchObject({ displayName: "A", organization: "KLHK", email: "a@b.co" })
    await store.deleteProfile("p1")
    expect(await store.getProfile("p1")).toBeUndefined()
    await store.deleteProfile("p1") // idempoten
  })

  it("profil tidak tercampur dengan data lahan pengguna yang sama", async () => {
    await store.saveProfile("p2", { displayName: "B" })
    await store.createOwned("fields", "p2", { name: "lahan" })
    expect(await store.listOwned("fields", "p2")).toHaveLength(1)
    await store.deleteAllOwned("fields", "p2")
    expect(await store.getProfile("p2")).toMatchObject({ displayName: "B" })
  })

  it("peringatan admin: buat, daftar terbaru dulu, ubah, hapus, 404 bila tidak ada", async () => {
    const a = await store.createAlert<{ id: string; title: string; createdBy: string }>({ title: "A", status: "aktif" }, "admin1")
    const b = await store.createAlert<{ id: string }>({ title: "B", status: "aktif" }, "admin1")
    expect(a.createdBy).toBe("admin1")
    const list = await store.listAlerts<{ id: string }>()
    expect(list.map((x) => x.id).slice(0, 2)).toEqual([b.id, a.id])

    expect(await store.updateAlert("" + a.id, { status: "selesai" })).toMatchObject({ id: a.id, status: "selesai", title: "A" })
    await store.deleteAlert(a.id)
    await store.deleteAlert(b.id)
    await rejects404(store.deleteAlert(a.id))
    await rejects404(store.updateAlert("tidak-ada", { status: "x" }))
  })
})
