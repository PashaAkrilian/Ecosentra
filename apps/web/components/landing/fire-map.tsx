"use client"

import { useEffect, useRef } from "react"
import { useApi } from "@/hooks/use-api"
import type { EarthquakesResponse, HotspotPointsResponse } from "@/lib/data/types"
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format"
import { MAP_H, MAP_W, project } from "./map-frame"

const RES = 2 // piksel kanvas per satuan viewBox

/**
 * Peta Indonesia dengan deteksi titik api 24 jam terakhir (data langsung dari /api/hotspots).
 * Titik muncul berurutan menurut waktu akuisisi satelit — satu-satunya gerak otomatis di halaman.
 */
export function FireMap({ outline }: { outline: string }) {
  const fires = useApi<HotspotPointsResponse>("/api/hotspots?range=24h")
  const quakes = useApi<EarthquakesResponse>("/api/earthquakes")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !fires.data) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "rgba(217, 72, 30, 0.62)"
    const points = [...fires.data.points].sort((a, b) => a[4] - b[4])
    let drawn = 0
    const drawUpTo = (n: number) => {
      for (; drawn < n; drawn++) {
        const [x, y] = project(points[drawn]![0], points[drawn]![1])
        ctx.beginPath()
        ctx.arc(x * RES, y * RES, 3.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawUpTo(points.length)
      return
    }
    let raf = 0
    let start = 0
    const step = (t: number) => {
      start ||= t
      const p = Math.min(1, (t - start) / 1800)
      drawUpTo(Math.floor(points.length * (1 - (1 - p) ** 2)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [fires.data])

  const top = fires.data?.byProvince[0]
  const quake = quakes.data?.recent[0]

  return (
    <figure>
      <div className="relative">
        <div className="relative w-full" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="absolute inset-0 h-full w-full" aria-hidden>
            <path d={outline} fill="var(--land)" stroke="var(--land-edge)" strokeWidth={0.6} strokeLinejoin="round" />
          </svg>
          <canvas
            ref={canvasRef}
            width={MAP_W * RES}
            height={MAP_H * RES}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={
              fires.data
                ? `Peta ${formatNumber(fires.data.total)} titik api yang terdeteksi satelit di Indonesia dalam 24 jam terakhir`
                : "Peta titik api Indonesia"
            }
          />
        </div>

        <div className="mt-6 md:absolute md:bottom-1 md:left-0 md:mt-0 md:w-[22%] md:min-w-[11rem]">
          {fires.error ? (
            <div className="text-sm">
              <p>Data titik api belum bisa dimuat.</p>
              <button onClick={fires.reload} className="mt-1 font-medium text-[var(--canopy)] underline underline-offset-2">
                Muat ulang
              </button>
            </div>
          ) : (
            <>
              <p className="font-display text-6xl font-semibold leading-none tabular-nums sm:text-7xl">
                {fires.data ? formatNumber(fires.data.total) : <span className="inline-block h-14 w-32 animate-pulse rounded bg-[var(--land)]" aria-label="Memuat" />}
              </p>
              <p className="mt-2 text-sm">titik api terdeteksi dalam 24 jam terakhir</p>
              {top && (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Terbanyak di {top.name} ({formatNumber(top.count)})
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <figcaption className="mt-5 flex flex-col gap-1 border-t border-[var(--rule)] pt-3 text-xs text-[var(--muted)] sm:flex-row sm:justify-between">
        <span>
          {fires.data
            ? `${fires.data.source.satellite}, diambil ${formatDateTime(fires.data.source.fetchedAt)}. Titik api bukan kebakaran terverifikasi.`
            : "NASA FIRMS, satelit VIIRS 375 m."}
        </span>
        {quake && (
          <span>
            Gempa M {quake.magnitude.toFixed(1)} terbaru (BMKG): {quake.region}, {formatRelative(quake.occurredAt)}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
