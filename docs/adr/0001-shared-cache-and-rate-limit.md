# ADR-0001: Cache dan rate limit bersama (Redis opsional)

**Status:** Accepted  
**Tanggal:** 2026-10-31

## Konteks
`server/cache.ts` dan `server/rateLimit.ts` memakai `Map` per instance. Web di-deploy ke Vercel (serverless):
instance sering dingin, muat CSV FIRMS bisa 5-60 detik, dan batas rate limit tidak mengikat lintas instance
(penting untuk `/api/chat` yang berbiaya).

## Keputusan
- Redis (Upstash REST lewat `fetch`, tanpa dependensi) sebagai tingkat 2, **opsional**: tanpa
  `UPSTASH_REDIS_REST_URL/TOKEN` perilaku sama seperti sebelumnya (mode demo utuh).
- Cache: `Map` lokal tetap tingkat 1; instance dingin membaca Redis dan tetap SWR. Refresh basi berjalan lewat
  `after()` agar tidak dibunuh serverless. Kegagalan Redis tidak fatal.
- Rate limit: fixed-window `INCR`/`EXPIRE NX`/`TTL` di Redis; bila Redis gagal jatuh ke sliding-window lokal.
- `GET /api/cron/warm` (dijaga `CRON_SECRET`) dipanggil GitHub Actions tiap 10 menit (`warm.yml`) agar cache hangat.
  Bukan `vercel.json` cron: jadwal 10 menit ditolak di plan Hobby dan bisa menggagalkan deploy.
- `maxDuration = 60` pada route yang bisa memicu muat FIRMS; kedua `Map` dibatasi ukurannya.

## Konsekuensi
- Lebih mudah: cache hangat lintas instance, batas biaya Claude yang sungguhan.
- Lebih sulit: satu vendor opsional, perbedaan perilaku lokal vs produksi, nilai besar harus muat di batas Redis.
- Ditinjau ulang: ukuran payload FIRMS 7d vs batas request Upstash (jika gagal ditulis, hanya log peringatan),
  lock lintas instance (`SET NX`) bila beban sumber jadi masalah.

## Langkah operasional
1. Buat database Upstash, isi `UPSTASH_REDIS_REST_URL/TOKEN` dan `CRON_SECRET` di env Vercel.
2. Isi secret GitHub `SITE_URL` dan `CRON_SECRET` (sama dengan Vercel).
