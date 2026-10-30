import "server-only"
import { provincesGeoJson } from "@/server/geo/indonesia"
import { project } from "./map-frame"

let cache: string | null = null

/** Garis luar provinsi sebagai satu path SVG ringan (ring luar saja, titik berdekatan dibuang). */
export function indonesiaOutline(): string {
  if (cache) return cache
  const parts: string[] = []
  for (const feature of provincesGeoJson().features) {
    const geometry = feature.geometry as { type: string; coordinates: number[][][] | number[][][][] }
    const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as number[][][][]
    for (const polygon of polygons) {
      let d = ""
      let lastX = Infinity
      let lastY = Infinity
      for (const [lng, lat] of polygon[0]!) {
        const [x, y] = project(lat!, lng!)
        if (Math.hypot(x - lastX, y - lastY) < 0.8) continue
        d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`
        lastX = x
        lastY = y
      }
      if (d) parts.push(`${d}Z`)
    }
  }
  return (cache = parts.join(""))
}
