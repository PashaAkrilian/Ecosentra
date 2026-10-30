import { NextResponse } from "next/server"
import { handleRoute, HttpError } from "@/server/http"
import { getEarthquakes } from "@/server/sources/bmkg"
import { getHotspotDataset } from "@/server/sources/firms"

export const maxDuration = 60

// Memanaskan cache bersama (Redis) supaya pengguna jarang kena muat dingin.
// Dipanggil terjadwal (.github/workflows/warm.yml); ditolak kalau CRON_SECRET belum diisi.
export async function GET(request: Request) {
  return handleRoute(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new HttpError(401, "Tidak diizinkan.")
    }
    const results = await Promise.allSettled([getHotspotDataset("24h"), getHotspotDataset("7d"), getEarthquakes()])
    return NextResponse.json({ ok: results.map((r) => r.status === "fulfilled") })
  })
}
