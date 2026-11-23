import "server-only"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"

/**
 * Dilempar kalau route butuh login/database tapi konfigurasi AWS belum di-set.
 * Route handler memetakannya ke HTTP 503 (lihat server/http.ts), jadi aplikasi
 * tetap bisa start & build tanpa AWS — fitur data publik (FIRMS, BMKG, dst.) tetap jalan.
 */
export class AwsNotConfiguredError extends Error {
  constructor() {
    super("Login/database AWS belum dikonfigurasi di server (lihat apps/web/.env.local.example).")
    this.name = "AwsNotConfiguredError"
  }
}

/** Login: Amazon Cognito User Pool + app client (tanpa secret). */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID)
}

/** Penyimpanan data pengguna: satu tabel DynamoDB. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DYNAMODB_TABLE)
}

export function tableName(): string {
  if (!isDatabaseConfigured()) throw new AwsNotConfiguredError()
  return process.env.DYNAMODB_TABLE!
}

let docClient: DynamoDBDocumentClient | undefined

/**
 * Klien DynamoDB. Kredensial dari rantai bawaan AWS SDK (role EC2 di produksi; env/profil di lokal).
 * DYNAMODB_ENDPOINT hanya untuk pengembangan & uji lokal (mis. Moto / DynamoDB Local).
 */
export function getDocClient(): DynamoDBDocumentClient {
  if (!isDatabaseConfigured()) throw new AwsNotConfiguredError()
  docClient ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-2",
      endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  )
  return docClient
}
