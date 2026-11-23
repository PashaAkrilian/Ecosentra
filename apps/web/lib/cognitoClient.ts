import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider"

// Di browser Cognito hanya dipakai untuk login (operasi publik tanpa kredensial AWS). Data pengguna
// diakses lewat API routes. Nilai NEXT_PUBLIC_* di-inline saat build, jadi harus ditulis literal.
const config = {
  region: process.env.NEXT_PUBLIC_COGNITO_REGION,
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  // Hanya untuk uji lokal dengan emulator Cognito.
  endpoint: process.env.NEXT_PUBLIC_COGNITO_ENDPOINT,
}

export const isAuthClientConfigured = Boolean(config.region && config.clientId)

export interface SessionUser {
  uid: string
  email: string | null
  displayName: string | null
}

interface Session {
  idToken: string
  accessToken: string
  refreshToken: string
  /** Kedaluwarsa ID token (ms epoch). */
  expiresAt: number
}

// shortcut: token di localStorage terbaca oleh skrip apa pun di halaman (risiko XSS); CSP ketat di
// next.config.mjs mengurangi risikonya. Upgrade ke cookie httpOnly lewat route server kalau ancamannya naik.
const STORAGE_KEY = "ecosentra.session"
const REFRESH_MARGIN_MS = 60_000

let client: CognitoIdentityProviderClient | undefined
function cognito() {
  if (!isAuthClientConfigured) throw new Error("Login belum dikonfigurasi (NEXT_PUBLIC_COGNITO_* kosong).")
  client ??= new CognitoIdentityProviderClient({ region: config.region, endpoint: config.endpoint || undefined })
  return client
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* penyimpanan diblokir (mode privat): sesi hanya hidup selama tab terbuka */
  }
}

function decodePayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1] ?? ""
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/")
  const json = decodeURIComponent(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  )
  return JSON.parse(json) as Record<string, unknown>
}

function userFromToken(idToken: string): SessionUser {
  const claims = decodePayload(idToken)
  const text = (v: unknown) => (typeof v === "string" && v ? v : null)
  return { uid: String(claims.sub), email: text(claims.email), displayName: text(claims.name) }
}

/** Pengguna dari sesi tersimpan (tanpa jaringan), atau null. Sesi yang tak bisa diperbarui lagi tetap dibaca di sini. */
export function currentUser(): SessionUser | null {
  const session = readSession()
  if (!session) return null
  try {
    return userFromToken(session.idToken)
  } catch {
    writeSession(null)
    return null
  }
}

function store(result: { IdToken?: string; AccessToken?: string; RefreshToken?: string; ExpiresIn?: number } | undefined, previous?: Session) {
  if (!result?.IdToken || !result.AccessToken) throw new Error("Respons login tidak lengkap.")
  const refreshToken = result.RefreshToken ?? previous?.refreshToken
  if (!refreshToken) throw new Error("Respons login tidak memuat token pembaruan.")
  const session: Session = {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken,
    expiresAt: Date.now() + (result.ExpiresIn ?? 3600) * 1000,
  }
  writeSession(session)
  return userFromToken(session.idToken)
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const response = await cognito().send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  )
  if (response.ChallengeName) throw new Error(`Tantangan login "${response.ChallengeName}" belum didukung. Hubungi pemilik instalasi.`)
  return store(response.AuthenticationResult)
}

/** Mengembalikan `confirmed: false` kalau pengguna harus memasukkan kode verifikasi dari email. */
export async function signUp(name: string, email: string, password: string): Promise<{ confirmed: boolean }> {
  const response = await cognito().send(
    new SignUpCommand({
      ClientId: config.clientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }, ...(name ? [{ Name: "name", Value: name }] : [])],
    }),
  )
  return { confirmed: Boolean(response.UserConfirmed) }
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognito().send(new ConfirmSignUpCommand({ ClientId: config.clientId, Username: email, ConfirmationCode: code }))
}

export async function resendCode(email: string): Promise<void> {
  await cognito().send(new ResendConfirmationCodeCommand({ ClientId: config.clientId, Username: email }))
}

export async function startPasswordReset(email: string): Promise<void> {
  await cognito().send(new ForgotPasswordCommand({ ClientId: config.clientId, Username: email }))
}

export async function finishPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  await cognito().send(
    new ConfirmForgotPasswordCommand({ ClientId: config.clientId, Username: email, ConfirmationCode: code, Password: newPassword }),
  )
}

export async function signOut(): Promise<void> {
  const session = readSession()
  writeSession(null)
  if (!session) return
  // Cabut sesi di server (best-effort): kegagalan jaringan tidak boleh menahan logout lokal.
  await cognito().send(new GlobalSignOutCommand({ AccessToken: session.accessToken })).catch(() => undefined)
}

let refreshing: Promise<string | null> | null = null

/** ID token yang masih berlaku (diperbarui otomatis bila hampir kedaluwarsa), atau null kalau belum login/sesi habis. */
export async function getIdToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null
  if (session.expiresAt - REFRESH_MARGIN_MS > Date.now()) return session.idToken

  refreshing ??= (async () => {
    try {
      const response = await cognito().send(
        new InitiateAuthCommand({
          AuthFlow: "REFRESH_TOKEN_AUTH",
          ClientId: config.clientId,
          AuthParameters: { REFRESH_TOKEN: session.refreshToken },
        }),
      )
      store(response.AuthenticationResult, session)
      return readSession()!.idToken
    } catch {
      writeSession(null) // token pembaruan ditolak/kedaluwarsa: sesi berakhir
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Mengamati perubahan sesi dari tab lain. */
export function onSessionChange(listener: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener("storage", handler)
  return () => window.removeEventListener("storage", handler)
}
