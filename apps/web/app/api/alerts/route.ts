import { NextResponse } from "next/server"
import type { Alert } from "@/lib/data/types"
import { alertInputSchema } from "@/lib/schemas"
import { isDatabaseConfigured } from "@/server/aws"
import { requireAdmin } from "@/server/auth"
import { handleRoute, readJsonBody } from "@/server/http"
import { createAlert, listAlerts } from "@/server/store"

/**
 * Peringatan yang dikurasi admin (melengkapi peringatan otomatis dari
 * BMKG & FIRMS di halaman Peringatan Bencana). Baca: publik. Tulis: admin.
 * Kalau database belum dikonfigurasi, GET tetap 200 dengan daftar kosong
 * supaya halaman publik tetap jalan.
 */
export async function GET() {
  return handleRoute(async () => {
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ configured: false, alerts: [] })
    }
    const alerts = (await listAlerts<Alert & { createdBy?: string }>()).map(({ createdBy: _createdBy, ...alert }) => alert)
    return NextResponse.json(
      { configured: true, alerts },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    )
  })
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin(request)
    const input = alertInputSchema.parse(await readJsonBody(request))
    const created = await createAlert<Alert & { createdBy?: string }>(input, admin.uid)
    const { createdBy: _createdBy, ...alert } = created
    return NextResponse.json(alert, { status: 201 })
  })
}
