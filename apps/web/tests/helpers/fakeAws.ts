import { BatchWriteCommand, DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"

/**
 * DynamoDB & Cognito palsu in-memory untuk test API routes. Yang diganti hanya klien DynamoDB
 * (`getDocClient`) dan verifikasi token; kode `server/store.ts` yang SESUNGGUHNYA tetap berjalan di atasnya,
 * jadi ekspresi kunci/kondisi/pembaruannya ikut teruji. Hanya subset perintah yang dipakai store yang didukung.
 * Dipasang lewat vi.mock("@/server/aws") dan vi.mock("@/server/cognito").
 */

type Item = Record<string, unknown>

export class FakeTable {
  /** pk -> (sk -> item) */
  partitions = new Map<string, Map<string, Item>>()

  private partition(pk: string) {
    if (!this.partitions.has(pk)) this.partitions.set(pk, new Map())
    return this.partitions.get(pk)!
  }

  reset() {
    this.partitions.clear()
  }

  /** Semua sk milik koleksi tertentu (lintas pengguna) — untuk asersi di test. */
  ownedSortKeys(collection: string): string[] {
    return [...this.partitions.values()].flatMap((p) => [...p.keys()]).filter((sk) => sk.startsWith(`${collection}#`))
  }

  countOwned(collection: string) {
    return this.ownedSortKeys(collection).length
  }

  hasProfile(uid: string) {
    return Boolean(this.partitions.get(`USER#${uid}`)?.has("PROFILE"))
  }

  get(pk: string, sk: string) {
    return this.partitions.get(pk)?.get(sk)
  }

  put(pk: string, sk: string, item: Item) {
    this.partition(pk).set(sk, item)
  }

  delete(pk: string, sk: string) {
    this.partitions.get(pk)?.delete(sk)
  }

  list(pk: string) {
    return [...(this.partitions.get(pk)?.values() ?? [])]
  }
}

export const fakeTable = new FakeTable()

class ConditionalCheckFailedException extends Error {
  constructor() {
    super("The conditional request failed")
    this.name = "ConditionalCheckFailedException"
  }
}

/** Mengurai "SET #k0 = :v0, #k1 = :v1" menjadi { atribut: nilai }. */
function parseSet(input: { UpdateExpression?: string; ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, unknown> }) {
  const body = (input.UpdateExpression ?? "").replace(/^SET\s+/, "")
  const out: Item = {}
  for (const part of body.split(",")) {
    const [name, value] = part.split("=").map((s) => s.trim())
    if (!name || !value) continue
    out[input.ExpressionAttributeNames?.[name] ?? name] = input.ExpressionAttributeValues?.[value]
  }
  return out
}

/** "#f0 = :f0 AND #f1 = :f1" -> daftar [atribut, nilai]. */
function parseFilter(input: { FilterExpression?: string; ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, unknown> }) {
  if (!input.FilterExpression) return []
  return input.FilterExpression.split(/\s+AND\s+/).map((clause) => {
    const [name, value] = clause.split("=").map((s) => s.trim())
    return [input.ExpressionAttributeNames?.[name!] ?? name!, input.ExpressionAttributeValues?.[value!]] as const
  })
}

export const fakeDocClient = {
  async send(command: unknown): Promise<Record<string, unknown>> {
    if (command instanceof GetCommand) {
      const { pk, sk } = command.input.Key as { pk: string; sk: string }
      const item = fakeTable.get(pk, sk)
      return { Item: item ? { ...item } : undefined }
    }

    if (command instanceof UpdateCommand) {
      const input = command.input
      const { pk, sk } = input.Key as { pk: string; sk: string }
      const existing = fakeTable.get(pk, sk)
      if (input.ConditionExpression === "attribute_exists(pk)" && !existing) throw new ConditionalCheckFailedException()
      const next = { ...(existing ?? { pk, sk }), ...parseSet(input as never) }
      fakeTable.put(pk, sk, next)
      return { Attributes: { ...next } }
    }

    if (command instanceof DeleteCommand) {
      const input = command.input
      const { pk, sk } = input.Key as { pk: string; sk: string }
      if (input.ConditionExpression === "attribute_exists(pk)" && !fakeTable.get(pk, sk)) throw new ConditionalCheckFailedException()
      fakeTable.delete(pk, sk)
      return {}
    }

    if (command instanceof QueryCommand) {
      const input = command.input
      const values = input.ExpressionAttributeValues as Record<string, string>
      const filters = parseFilter(input as never)
      let items = fakeTable
        .list(values[":pk"]!)
        .filter((item) => String(item.sk).startsWith(values[":prefix"] ?? ""))
        .filter((item) => filters.every(([field, value]) => item[field] === value))
      items = items.sort((a, b) => String(a.sk).localeCompare(String(b.sk)))
      if (input.ScanIndexForward === false) items.reverse()
      return { Items: items.map((item) => ({ ...item })) }
    }

    if (command instanceof BatchWriteCommand) {
      for (const requests of Object.values(command.input.RequestItems ?? {})) {
        for (const request of requests) {
          const key = request.DeleteRequest?.Key as { pk: string; sk: string } | undefined
          if (key) fakeTable.delete(key.pk, key.sk)
        }
      }
      return { UnprocessedItems: {} }
    }

    throw new Error(`fakeDocClient: perintah tidak didukung (${(command as object)?.constructor?.name})`)
  },
}

// ---------------------------------------------------------------------------------------- Cognito palsu

export const TOKENS: Record<string, { sub: string; email: string; name?: string; groups?: string[] }> = {
  "token-alice": { sub: "alice", email: "alice@example.com" },
  "token-bob": { sub: "bob", email: "bob@example.com" },
  "token-carol": { sub: "carol", email: "carol@example.com", name: "Carol Dewi" },
  "token-admin": { sub: "admin", email: "admin@example.com", groups: ["admin"] },
}

export const fakeCognito = {
  deletedUsernames: [] as string[],
  async verifyIdToken(token: string) {
    const claims = TOKENS[token]
    if (!claims) throw new Error("token tidak valid")
    return { sub: claims.sub, email: claims.email, name: claims.name ?? null, username: claims.sub, groups: claims.groups ?? [] }
  },
  async deleteCognitoUser(username: string) {
    this.deletedUsernames.push(username)
  },
}

// ---------------------------------------------------------------------------------------- modul tiruan

export class AwsNotConfiguredError extends Error {
  constructor() {
    super("Login/database AWS belum dikonfigurasi di server (lihat apps/web/.env.local.example).")
    this.name = "AwsNotConfiguredError"
  }
}

/** `configured` menyalakan/mematikan login dan database sekaligus (mode demo). */
export const awsState = { configured: true }

/** Factory untuk vi.mock("@/server/aws", ...). */
export function fakeAwsModule() {
  return {
    AwsNotConfiguredError,
    isAuthConfigured: () => awsState.configured,
    isDatabaseConfigured: () => awsState.configured,
    tableName: () => {
      if (!awsState.configured) throw new AwsNotConfiguredError()
      return "ecosentra-test"
    },
    getDocClient: () => {
      if (!awsState.configured) throw new AwsNotConfiguredError()
      return fakeDocClient
    },
  }
}

/** Factory untuk vi.mock("@/server/cognito", ...). */
export function fakeCognitoModule() {
  return {
    verifyIdToken: (token: string) => fakeCognito.verifyIdToken(token),
    deleteCognitoUser: (username: string) => fakeCognito.deleteCognitoUser(username),
  }
}

/** Buat Request dengan token & body JSON opsional. */
export function apiRequest(
  path: string,
  { token, method = "GET", body }: { token?: string; method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers["content-type"] = "application/json"
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })
