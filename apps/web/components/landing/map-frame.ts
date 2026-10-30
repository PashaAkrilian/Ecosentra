// Bingkai peta Indonesia untuk beranda: ekuirektangular, bujur 94,5-141,5, lintang 6,5 sampai -11,5.
export const MAP_W = 1000
export const MAP_H = 383

const LNG_MIN = 94.5
const LAT_MAX = 6.5
const SCALE = MAP_W / 47

export function project(lat: number, lng: number): [number, number] {
  return [(lng - LNG_MIN) * SCALE, (LAT_MAX - lat) * SCALE]
}
