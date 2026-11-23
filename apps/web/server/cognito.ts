import "server-only"
import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { AwsNotConfiguredError, isAuthConfigured } from "@/server/aws"

export interface CognitoClaims {
  /** `sub` — pengenal tetap pengguna, dipakai sebagai kunci data. */
  sub: string
  email: string | null
  name: string | null
  /** `cognito:username`, dibutuhkan untuk AdminDeleteUser. */
  username: string
  groups: string[]
}

function poolId(): string {
  if (!isAuthConfigured()) throw new AwsNotConfiguredError()
  return process.env.COGNITO_USER_POOL_ID!
}

/** Region diambil dari awalan pool id ("ap-southeast-2_AbCdEf"), jadi tidak bisa salah-set terpisah. */
function region(): string {
  return poolId().split("_")[0]!
}

function issuer(): string {
  return `https://cognito-idp.${region()}.amazonaws.com/${poolId()}`
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

function getJwks() {
  // COGNITO_JWKS_URL hanya untuk uji lokal (emulator); produksi memakai JWKS resmi Cognito.
  jwks ??= createRemoteJWKSet(new URL(process.env.COGNITO_JWKS_URL || `${issuer()}/.well-known/jwks.json`))
  return jwks
}

/**
 * Verifikasi ID token Cognito: tanda tangan (JWKS), penerbit, audiens (app client), masa berlaku,
 * dan jenis token. Melempar kalau tidak valid.
 */
export async function verifyIdToken(token: string): Promise<CognitoClaims> {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: issuer(),
    audience: process.env.COGNITO_CLIENT_ID!,
  })
  if (payload.token_use !== "id") throw new Error("Bukan ID token.")
  const str = (value: unknown) => (typeof value === "string" && value ? value : null)
  const groups = payload["cognito:groups"]
  return {
    sub: String(payload.sub),
    email: str(payload.email),
    name: str(payload.name),
    username: str(payload["cognito:username"]) ?? String(payload.sub),
    groups: Array.isArray(groups) ? groups.map(String) : [],
  }
}

/** Hapus akun login (dipakai saat pengguna menghapus akunnya). Butuh izin cognito-idp:AdminDeleteUser. */
export async function deleteCognitoUser(username: string): Promise<void> {
  const client = new CognitoIdentityProviderClient({
    region: region(),
    endpoint: process.env.COGNITO_ENDPOINT || undefined,
  })
  await client.send(new AdminDeleteUserCommand({ UserPoolId: poolId(), Username: username }))
}
