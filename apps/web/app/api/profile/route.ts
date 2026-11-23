import { NextResponse } from "next/server"
import type { UserProfile } from "@/lib/data/types"
import { profileInputSchema } from "@/lib/schemas"
import { requireUser, type AuthUser } from "@/server/auth"
import { deleteCognitoUser } from "@/server/cognito"
import { handleRoute, readJsonBody } from "@/server/http"
import { deleteAllOwned, deleteProfile, getProfile, saveProfile } from "@/server/store"

// Profil disimpan di item PROFILE milik pengguna. Role admin TIDAK disimpan di sini
// (bisa diubah user lewat PUT) — sumbernya grup Cognito di ID token.
function toProfile(user: AuthUser, data: Record<string, unknown> | undefined): UserProfile {
  return {
    uid: user.uid,
    email: user.email,
    isAdmin: user.isAdmin,
    displayName: (data?.displayName as string | undefined) ?? user.name ?? user.email?.split("@")[0] ?? "Pengguna",
    organization: (data?.organization as string | undefined) ?? "",
  }
}

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    return NextResponse.json(toProfile(user, await getProfile(user.uid)))
  })
}

export async function PUT(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    const input = profileInputSchema.parse(await readJsonBody(request))
    return NextResponse.json(toProfile(user, await saveProfile(user.uid, { ...input, email: user.email })))
  })
}

/**
 * Hapus akun beserta SEMUA data milik user (lahan, riwayat analisis, skenario,
 * profil) lalu hapus akun login. Tidak bisa dibatalkan. Peringatan publik
 * yang pernah diterbitkan admin tetap ada (konten publik, bukan data pribadi).
 */
export async function DELETE(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    // Urutan: data dulu, akun login terakhir — kalau gagal di tengah, user masih bisa login & mencoba lagi.
    for (const collection of ["landCoverSnapshots", "decisions", "fields"] as const) {
      await deleteAllOwned(collection, user.uid)
    }
    await deleteProfile(user.uid)
    await deleteCognitoUser(user.username)
    return new NextResponse(null, { status: 204 })
  })
}
