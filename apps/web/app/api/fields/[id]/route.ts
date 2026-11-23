import { NextResponse } from "next/server"
import type { Field, LandCoverSnapshot } from "@/lib/data/types"
import { fieldUpdateSchema } from "@/lib/schemas"
import { requireUser } from "@/server/auth"
import { handleRoute, readJsonBody } from "@/server/http"
import { deleteOwned, getOwned, listOwned, updateOwned } from "@/server/store"

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    return NextResponse.json(await getOwned<Field>("fields", (await params).id, user.uid))
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    const input = fieldUpdateSchema.parse(await readJsonBody(request))
    // Lokasi berubah -> hasil analisis lama tidak berlaku lagi.
    const data = input.location ? { ...input, lastAnalysis: null } : input
    return NextResponse.json(await updateOwned<Field>("fields", (await params).id, user.uid, data))
  })
}

export async function DELETE(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    const { id } = await params
    await deleteOwned("fields", id, user.uid)

    // Hapus juga riwayat analisis lahan ini.
    const snapshots = await listOwned<LandCoverSnapshot>("landCoverSnapshots", user.uid, { fieldId: id })
    for (const snapshot of snapshots) await deleteOwned("landCoverSnapshots", snapshot.id, user.uid)

    return new NextResponse(null, { status: 204 })
  })
}
