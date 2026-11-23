import { NextResponse } from "next/server"
import type { Field, LandCoverSnapshot } from "@/lib/data/types"
import { requireUser } from "@/server/auth"
import { handleRoute } from "@/server/http"
import { createOwned, getOwned, updateOwned } from "@/server/store"
import { enforceRateLimit } from "@/server/rateLimit"
import { bufferForArea } from "@/lib/geo"
import { analyzeLandCover } from "@/server/sources/landcover"

type Params = { params: Promise<{ id: string }> }

/**
 * Analisis tutupan lahan untuk lokasi lahan milik user, simpan hasilnya
 * sebagai snapshot, dan perbarui ringkasan `lastAnalysis` di dokumen lahan.
 * Hasil dihitung di server — klien tidak bisa mengirim hasil analisis sendiri.
 */
export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser(request)
    await enforceRateLimit(request, "field-analyze", 10, 60_000)

    const field = await getOwned<Field>("fields", (await params).id, user.uid)
    const result = await analyzeLandCover(field.location.lat, field.location.lng, bufferForArea(field.areaHa))

    const { source, ...analysis } = result
    const snapshot = await createOwned<LandCoverSnapshot>("landCoverSnapshots", user.uid, {
      ...analysis,
      fieldId: field.id,
      dataset: source.dataset,
      year: source.year,
    })

    await updateOwned("fields", field.id, user.uid, {
      lastAnalysis: {
        dominantClass: result.dominantClass,
        dataset: `${source.dataset} (${source.year})`,
        analyzedAt: snapshot.createdAt ?? new Date().toISOString(),
      },
    })

    return NextResponse.json(snapshot, { status: 201 })
  })
}
