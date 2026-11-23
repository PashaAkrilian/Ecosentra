import { NextResponse } from "next/server"
import type { Alert } from "@/lib/data/types"
import { alertUpdateSchema } from "@/lib/schemas"
import { requireAdmin } from "@/server/auth"
import { handleRoute, readJsonBody } from "@/server/http"
import { deleteAlert, updateAlert } from "@/server/store"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    await requireAdmin(request)
    const input = alertUpdateSchema.parse(await readJsonBody(request))
    const { createdBy: _createdBy, ...alert } = await updateAlert<Alert & { createdBy?: string }>((await params).id, input)
    return NextResponse.json(alert)
  })
}

export async function DELETE(request: Request, { params }: Params) {
  return handleRoute(async () => {
    await requireAdmin(request)
    await deleteAlert((await params).id)
    return new NextResponse(null, { status: 204 })
  })
}
