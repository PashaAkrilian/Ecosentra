import "server-only"
import { randomBytes } from "node:crypto"
import { BatchWriteCommand, DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import { getDocClient, tableName } from "@/server/aws"
import { HttpError } from "@/server/http"

/**
 * Penyimpanan data di satu tabel DynamoDB (kunci: `pk` HASH, `sk` RANGE).
 *
 *   data milik pengguna  pk = USER#<sub>   sk = <koleksi>#<id>   (lahan, riwayat analisis, skenario)
 *   profil pengguna      pk = USER#<sub>   sk = PROFILE
 *   peringatan admin     pk = ALERTS       sk = <id>
 *
 * Kepemilikan dijamin oleh KUNCI, bukan oleh pengecekan terpisah: semua baca/tulis data pengguna
 * selalu membawa `pk = USER#<sub dari token>`, jadi dokumen milik orang lain tidak mungkin terbaca
 * dan diperlakukan seperti tidak ada (404, bukan 403, supaya keberadaannya tidak bocor).
 * `id` berawalan waktu (naik tegas), jadi urutan `sk` = urutan pembuatan.
 */

export type OwnedCollection = "fields" | "landCoverSnapshots" | "decisions"

const LIST_LIMIT = 200
const ALERT_LIMIT = 100
const BATCH_SIZE = 25 // batas BatchWriteItem

type Item = Record<string, unknown>

const userKey = (uid: string) => `USER#${uid}`
const ALERTS_KEY = "ALERTS"
const PROFILE_SORT_KEY = "PROFILE"

let lastMs = 0
/** Waktu dalam ms yang selalu naik tegas, supaya id & `createdAt` berurutan walau dibuat di milidetik yang sama. */
function nextMs(): number {
  lastMs = Math.max(Date.now(), lastMs + 1)
  return lastMs
}

const newId = (ms: number) => `${String(ms).padStart(13, "0")}-${randomBytes(4).toString("hex")}`

function validId(id: string): boolean {
  return Boolean(id) && id.length <= 200 && !id.includes("/")
}

const notFound = (message = "Data tidak ditemukan.") => new HttpError(404, message)

/** Bentuk respons: buang kunci internal; `id` diambil dari `sk`. */
function serialize<T>(item: Item, idFromSort?: string): T {
  const { pk: _pk, sk, ...data } = item
  const id = idFromSort ?? String(sk).split("#").slice(1).join("#")
  return { id, ...data } as T
}

function isConditionFailure(error: unknown): boolean {
  return (error as { name?: string })?.name === "ConditionalCheckFailedException"
}

/** `SET #k0 = :v0, ...` untuk pembaruan sebagian; nama atribut selalu lewat placeholder (aman dari kata terpesan). */
function setExpression(data: Item) {
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const parts = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value], i) => {
      names[`#k${i}`] = key
      values[`:v${i}`] = value
      return `#k${i} = :v${i}`
    })
  return { expression: `SET ${parts.join(", ")}`, names, values }
}

async function update(pk: string, sk: string, data: Item): Promise<Item> {
  const { expression, names, values } = setExpression(data)
  try {
    const result = await getDocClient().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { pk, sk },
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(pk)",
        ReturnValues: "ALL_NEW",
      }),
    )
    return result.Attributes as Item
  } catch (error) {
    if (isConditionFailure(error)) throw notFound()
    throw error
  }
}

async function upsert(pk: string, sk: string, data: Item): Promise<Item> {
  const { expression, names, values } = setExpression(data)
  const result = await getDocClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk, sk },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  )
  return result.Attributes as Item
}

async function get(pk: string, sk: string): Promise<Item | undefined> {
  const result = await getDocClient().send(new GetCommand({ TableName: tableName(), Key: { pk, sk } }))
  return result.Item as Item | undefined
}

async function remove(pk: string, sk: string, mustExist: boolean): Promise<void> {
  try {
    await getDocClient().send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { pk, sk },
        ...(mustExist ? { ConditionExpression: "attribute_exists(pk)" } : {}),
      }),
    )
  } catch (error) {
    if (isConditionFailure(error)) throw notFound()
    throw error
  }
}

/** Query semua item dengan awalan `sk`, terbaru dulu, sampai `limit` item lolos filter (menelusuri halaman bila perlu). */
async function queryPrefix(pk: string, prefix: string, limit: number, filters: Record<string, string> = {}, keysOnly = false): Promise<Item[]> {
  const names: Record<string, string> = { "#sk": "sk" }
  // DynamoDB menolak nilai string kosong di kunci, jadi awalan kosong = tanpa syarat begins_with.
  const values: Record<string, unknown> = prefix ? { ":pk": pk, ":prefix": prefix } : { ":pk": pk }
  const filterParts = Object.entries(filters).map(([field, value], i) => {
    names[`#f${i}`] = field
    values[`:f${i}`] = value
    return `#f${i} = :f${i}`
  })

  const items: Item[] = []
  let startKey: Record<string, unknown> | undefined
  do {
    const page = await getDocClient().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: prefix ? "pk = :pk AND begins_with(#sk, :prefix)" : "pk = :pk",
        ...(filterParts.length ? { FilterExpression: filterParts.join(" AND ") } : {}),
        ...(keysOnly ? { ProjectionExpression: "pk, #sk" } : {}),
        ExpressionAttributeNames: prefix || keysOnly ? names : Object.fromEntries(Object.entries(names).filter(([k]) => k !== "#sk")),
        ExpressionAttributeValues: values,
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      }),
    )
    items.push(...((page.Items ?? []) as Item[]))
    startKey = page.LastEvaluatedKey
  } while (startKey && items.length < limit)
  return items.slice(0, limit)
}

// --------------------------------------------------------------------------- data milik pengguna

/** Daftar dokumen milik pengguna di satu koleksi, terbaru dulu. `filters`: kesamaan atribut (mis. { fieldId }). */
export async function listOwned<T>(collection: OwnedCollection, uid: string, filters: Record<string, string> = {}): Promise<T[]> {
  const items = await queryPrefix(userKey(uid), `${collection}#`, LIST_LIMIT, filters)
  return items.map((item) => serialize<T>(item))
}

export async function getOwned<T>(collection: OwnedCollection, id: string, uid: string): Promise<T> {
  if (!validId(id)) throw notFound()
  const item = await get(userKey(uid), `${collection}#${id}`)
  if (!item) throw notFound()
  return serialize<T>(item, id)
}

export async function createOwned<T>(collection: OwnedCollection, uid: string, data: object): Promise<T> {
  const ms = nextMs()
  const id = newId(ms)
  const now = new Date(ms).toISOString()
  const item = await upsert(userKey(uid), `${collection}#${id}`, { ...data, createdAt: now, updatedAt: now })
  return serialize<T>(item, id)
}

export async function updateOwned<T>(collection: OwnedCollection, id: string, uid: string, data: object): Promise<T> {
  if (!validId(id)) throw notFound()
  const item = await update(userKey(uid), `${collection}#${id}`, { ...data, updatedAt: new Date(nextMs()).toISOString() })
  return serialize<T>(item, id)
}

export async function deleteOwned(collection: OwnedCollection, id: string, uid: string): Promise<void> {
  if (!validId(id)) throw notFound()
  await remove(userKey(uid), `${collection}#${id}`, true)
}

async function deleteKeys(pk: string, sks: string[]): Promise<void> {
  for (let i = 0; i < sks.length; i += BATCH_SIZE) {
    let pending = sks.slice(i, i + BATCH_SIZE).map((sk) => ({ DeleteRequest: { Key: { pk, sk } } }))
    // DynamoDB bisa mengembalikan sebagian permintaan yang belum diproses; ulangi sampai habis.
    for (let attempt = 0; pending.length && attempt < 5; attempt++) {
      const result = await getDocClient().send(new BatchWriteCommand({ RequestItems: { [tableName()]: pending } }))
      pending = (result.UnprocessedItems?.[tableName()] ?? []) as typeof pending
    }
    if (pending.length) throw new Error("Sebagian data gagal dihapus; coba lagi.")
  }
}

/** Hapus semua dokumen milik pengguna di satu koleksi. Mengembalikan jumlah yang dihapus. */
export async function deleteAllOwned(collection: OwnedCollection, uid: string): Promise<number> {
  let deleted = 0
  for (;;) {
    const items = await queryPrefix(userKey(uid), `${collection}#`, 200, {}, true)
    if (items.length === 0) return deleted
    await deleteKeys(userKey(uid), items.map((item) => String(item.sk)))
    deleted += items.length
  }
}

// --------------------------------------------------------------------------- profil

export async function getProfile(uid: string): Promise<Item | undefined> {
  return get(userKey(uid), PROFILE_SORT_KEY)
}

export async function saveProfile(uid: string, data: Item): Promise<Item> {
  return upsert(userKey(uid), PROFILE_SORT_KEY, { ...data, updatedAt: new Date(nextMs()).toISOString() })
}

export async function deleteProfile(uid: string): Promise<void> {
  await remove(userKey(uid), PROFILE_SORT_KEY, false)
}

// --------------------------------------------------------------------------- peringatan admin

/** Peringatan kurasi admin, terbaru dulu. Bidang `createdBy` ikut dikembalikan; route publik yang membuangnya. */
export async function listAlerts<T>(): Promise<T[]> {
  const items = await queryPrefix(ALERTS_KEY, "", ALERT_LIMIT)
  return items.map((item) => serialize<T>(item, String(item.sk)))
}

export async function createAlert<T>(data: object, createdBy: string): Promise<T> {
  const ms = nextMs()
  const id = newId(ms)
  const item = await upsert(ALERTS_KEY, id, { ...data, createdBy, createdAt: new Date(ms).toISOString() })
  return serialize<T>(item, id)
}

export async function updateAlert<T>(id: string, data: object): Promise<T> {
  if (!validId(id)) throw notFound("Peringatan tidak ditemukan.")
  try {
    return serialize<T>(await update(ALERTS_KEY, id, data as Item), id)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw notFound("Peringatan tidak ditemukan.")
    throw error
  }
}

export async function deleteAlert(id: string): Promise<void> {
  if (!validId(id)) throw notFound("Peringatan tidak ditemukan.")
  try {
    await remove(ALERTS_KEY, id, true)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw notFound("Peringatan tidak ditemukan.")
    throw error
  }
}
