import "server-only"
import { AwsNotConfiguredError, isAuthConfigured } from "@/server/aws"
import { verifyIdToken } from "@/server/cognito"
import { HttpError } from "@/server/http"

export interface AuthUser {
  uid: string
  email: string | null
  /** Nama tampilan dari akun login (atribut `name` di ID token), bila ada. */
  name: string | null
  /** Nama pengguna Cognito, untuk menghapus akun. */
  username: string
  isAdmin: boolean
}

/**
 * Verifikasi ID token Cognito dari header `Authorization: Bearer <token>`.
 * Klien mendapat token ini dari Cognito (lihat components/auth-provider.tsx) dan
 * mengirimnya lewat lib/api-client.ts.
 *
 * Admin = anggota grup Cognito `admin`. Grup hanya bisa diubah lewat konsol/CLI AWS
 * oleh pemilik akun, tidak oleh pengguna sendiri.
 */
export async function requireUser(request: Request): Promise<AuthUser> {
  const header = request.headers.get("authorization")
  const match = header?.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new HttpError(401, "Login diperlukan untuk mengakses data ini.")
  }
  if (!isAuthConfigured()) throw new AwsNotConfiguredError()

  try {
    const claims = await verifyIdToken(match[1]!)
    return {
      uid: claims.sub,
      email: claims.email,
      name: claims.name,
      username: claims.username,
      isAdmin: claims.groups.includes("admin"),
    }
  } catch (error) {
    if (error instanceof AwsNotConfiguredError) throw error
    throw new HttpError(401, "Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.")
  }
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireUser(request)
  if (!user.isAdmin) {
    throw new HttpError(403, "Hanya admin yang boleh melakukan aksi ini.")
  }
  return user
}
