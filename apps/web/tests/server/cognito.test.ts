import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { verifyIdToken } from "@/server/cognito"

const POOL_ID = "ap-southeast-2_TestPool1"
const CLIENT_ID = "test-client-id"
const ISSUER = `https://cognito-idp.ap-southeast-2.amazonaws.com/${POOL_ID}`

let server: Server
let privateKey: KeyLike
let otherPrivateKey: KeyLike

async function sign(claims: Record<string, unknown>, opts: { key?: KeyLike; iss?: string; aud?: string; exp?: string | number } = {}) {
  return new SignJWT({ token_use: "id", sub: "user-123", email: "a@b.co", "cognito:username": "user-123", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.key ?? privateKey)
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256")
  privateKey = pair.privateKey
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" }

  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ keys: [jwk] }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  process.env.COGNITO_USER_POOL_ID = POOL_ID
  process.env.COGNITO_CLIENT_ID = CLIENT_ID
  process.env.COGNITO_JWKS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`
})

afterAll(async () => {
  delete process.env.COGNITO_JWKS_URL
  await new Promise((resolve) => server.close(resolve))
})

describe("verifyIdToken (Cognito)", () => {
  it("menerima ID token yang sah dan memetakan klaimnya", async () => {
    const claims = await verifyIdToken(await sign({ name: "Dimas", "cognito:groups": ["admin", "tim"] }))
    expect(claims).toEqual({ sub: "user-123", email: "a@b.co", name: "Dimas", username: "user-123", groups: ["admin", "tim"] })
  })

  it("tanpa klaim opsional: name null, groups kosong", async () => {
    const claims = await verifyIdToken(await sign({}))
    expect(claims.name).toBeNull()
    expect(claims.groups).toEqual([])
  })

  it("menolak tanda tangan dari kunci lain", async () => {
    await expect(verifyIdToken(await sign({}, { key: otherPrivateKey }))).rejects.toThrow()
  })

  it("menolak penerbit (issuer) yang salah", async () => {
    await expect(verifyIdToken(await sign({}, { iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Lain" }))).rejects.toThrow(/iss/)
  })

  it("menolak audiens (app client) yang salah", async () => {
    await expect(verifyIdToken(await sign({}, { aud: "client-lain" }))).rejects.toThrow(/aud/)
  })

  it("menolak token kedaluwarsa", async () => {
    await expect(verifyIdToken(await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 }))).rejects.toThrow(/exp/)
  })

  it("menolak access token (token_use bukan 'id')", async () => {
    await expect(verifyIdToken(await sign({ token_use: "access" }))).rejects.toThrow(/ID token/)
  })

  it("menolak token tanpa tanda tangan (alg none) dan teks acak", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(`{"iss":"${ISSUER}","aud":"${CLIENT_ID}","sub":"x"}`).toString("base64url")}.`
    await expect(verifyIdToken(none)).rejects.toThrow()
    await expect(verifyIdToken("bukan-jwt")).rejects.toThrow()
  })
})
