# Deployment & Konfigurasi

Urutan yang disarankan: **(1)** jalankan lokal dalam mode demo, **(2)** siapkan login &
penyimpanan di AWS (Cognito + DynamoDB), **(3)** deploy `apps/web` ke server (Docker),
**(4)** opsional: `services/geo`, LandAI penuh, MCP.

Semua variabel lingkungan `apps/web` dijelaskan di
[`apps/web/.env.local.example`](../apps/web/.env.local.example) dan **semuanya
opsional**.

## 1. Lokal, mode demo (tanpa kredensial)

Syarat: Node.js ≥ 22.12.

```bash
cd apps/web
npm ci
npm run dev          # http://localhost:8080
```

Peta, titik api, gempa, cuaca, NDVI, tutupan lahan (Esri), profil ekosistem,
peringatan otomatis, ekspor, dan LandAI mode aturan sudah berfungsi.
Panggilan pertama ke data titik api bisa 10–60 detik dari Indonesia (unduh CSV
NASA); setelah itu cache melayani.

Perintah berguna: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## 2. Login & penyimpanan di AWS

Aplikasi memakai **Amazon Cognito** (login) dan **Amazon DynamoDB** (data pengguna). Tanpa keduanya
aplikasi tetap berjalan dalam mode demo. Perintah di bawah memakai AWS CLI; ganti `<...>`.

> Status pengujian: perintah 2.1–2.2 (tabel, user pool, app client, grup) **sudah dijalankan di akun AWS nyata**, dan
> API diuji ujung-ke-ujung terhadap Cognito + DynamoDB asli (23/23: isolasi pengguna, grup admin, hapus akun) serta
> preflight CORS Cognito asli. **Belum terbukti**: kebijakan IAM minimal di 2.3 (pengujian memakai role admin),
> email kode verifikasi lewat browser, dan jalur EC2 + Caddy.

### 2.1 Tabel DynamoDB

Satu tabel, kunci `pk` (HASH) dan `sk` (RANGE), mode on-demand (tanpa biaya tetap):

```bash
aws dynamodb create-table --table-name ecosentra --region <region> --billing-mode PAY_PER_REQUEST \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --deletion-protection-enabled
```

Tata letak data (lihat `apps/web/server/store.ts`):

| Data | `pk` | `sk` |
|---|---|---|
| Lahan, riwayat analisis, skenario milik pengguna | `USER#<sub>` | `<koleksi>#<id>` |
| Profil pengguna | `USER#<sub>` | `PROFILE` |
| Peringatan kurasi admin | `ALERTS` | `<id>` |

Kepemilikan data dijamin oleh kunci: setiap baca/tulis membawa `pk = USER#<sub dari token>`, sehingga data
orang lain tidak mungkin terbaca (hasilnya 404, bukan 403).

### 2.2 User pool Cognito

```bash
aws cognito-idp create-user-pool --pool-name ecosentra --region <region> \
  --username-attributes email --auto-verified-attributes email \
  --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}' \
  --deletion-protection ACTIVE
# catat Id pool (mis. ap-southeast-2_AbCdEf)

aws cognito-idp create-user-pool-client --user-pool-id <pool-id> --client-name ecosentra-web --region <region> \
  --no-generate-secret --prevent-user-existence-errors ENABLED \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH
# catat ClientId

aws cognito-idp create-group --user-pool-id <pool-id> --group-name admin --region <region>
```

Pendaftaran mengirim **kode verifikasi ke email** (pengirim bawaan Cognito dibatasi sekitar 50 email/hari;
untuk lebih banyak, hubungkan Amazon SES). Login Google belum didukung (butuh Hosted UI + federasi).

### 2.3 Variabel lingkungan

```
# browser (tertanam saat build)
NEXT_PUBLIC_COGNITO_REGION=<region>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<ClientId>
# server
COGNITO_USER_POOL_ID=<pool-id>
COGNITO_CLIENT_ID=<ClientId>
DYNAMODB_TABLE=ecosentra
AWS_REGION=<region>
```

Kredensial AWS di server berasal dari **role IAM instance** (jangan menulis access key di file). Kebijakan minimal untuk role itu:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchWriteItem"],
      "Resource": "arn:aws:dynamodb:<region>:<akun>:table/ecosentra" },
    { "Effect": "Allow",
      "Action": "cognito-idp:AdminDeleteUser",
      "Resource": "arn:aws:cognito-idp:<region>:<akun>:userpool/<pool-id>" }
  ]
}
```

Buka `/settings` — semua integrasi yang Anda isi harus berstatus **Aktif**.

### 2.4 Peran admin

Daftar dulu lewat `/login`, lalu tambahkan akun ke grup `admin`:

```bash
aws cognito-idp admin-add-user-to-group --user-pool-id <pool-id> --username <username-atau-sub> --group-name admin
```

Perubahan grup baru berlaku setelah pengguna **keluar dan masuk lagi** (grup tertanam di ID token).
Admin dapat menerbitkan/menghapus peringatan kurasi di halaman Peringatan Bencana.

### 2.5 Pengembangan & uji lokal (tanpa akun AWS)

Cognito dan DynamoDB bisa ditiru secara lokal dengan [Moto](https://docs.getmoto.org/):

```bash
pip install 'moto[server]' boto3
moto_server -p 5555                       # DynamoDB + Cognito tiruan
# uji integrasi lapisan data:
cd apps/web && DYNAMODB_ENDPOINT=http://127.0.0.1:5555 npm run test:emulator
```

Untuk menjalankan aplikasi penuh terhadap emulator: buat tabel dan user pool seperti di atas dengan
`--endpoint-url http://127.0.0.1:5555`, lalu isi `DYNAMODB_ENDPOINT`, `COGNITO_ENDPOINT`, `COGNITO_JWKS_URL`
(`http://127.0.0.1:5555/<pool-id>/.well-known/jwks.json`), dan `NEXT_PUBLIC_COGNITO_ENDPOINT`.
Catatan: Moto menjawab preflight CORS dengan 500, jadi login dari browser butuh proxy kecil yang menambahkan
header CORS di depannya; Cognito sungguhan tidak butuh itu. Moto juga menerima kode verifikasi apa pun.

## 3. Deploy `apps/web`

### Docker di satu server (mis. EC2) — jalur yang disediakan repo

`apps/web/Dockerfile` membangun image standalone (Node 22, pengguna non-root, ±360 MB), dan
[`docker-compose.yml`](../docker-compose.yml) menjalankannya di belakang Caddy (HTTPS otomatis, sertifikat Let's Encrypt).

```bash
cp apps/web/.env.local.example apps/web/.env.production     # isi nilainya
export NEXT_PUBLIC_COGNITO_REGION=<region> NEXT_PUBLIC_COGNITO_CLIENT_ID=<ClientId>   # tertanam saat build
SITE_ADDRESS=ecosentra.site docker compose up -d --build
```

Catatan penting:

- **Domain harus sudah menunjuk ke IP server** sebelum Caddy dapat menerbitkan sertifikat.
- Container `web` sengaja **tanpa `ports:`**; hanya Caddy yang menerima trafik. Rate limit membaca IP dari
  `X-Forwarded-For` yang ditulis ulang Caddy; jika `web` dibuka langsung ke internet, header itu bisa dipalsukan.
- Security group: buka hanya port 80 dan 443 (SSH dibatasi ke IP Anda).
- Role IAM instance memakai kebijakan di 2.3.
- Tidak perlu mendaftarkan domain di Cognito: browser memanggilnya langsung lewat
  `cognito-idp.<region>.amazonaws.com` (sudah diizinkan di CSP).

### Platform lain

`next build && node .next/standalone/server.js` dengan Node ≥ 22.12 (salin `.next/static` ke
`.next/standalone/.next/static`). Pastikan:

- semua variabel `NEXT_PUBLIC_*` diset **saat build** (nilainya ikut tertanam di JS klien);
- proses punya akses jaringan keluar ke `firms.modaps.eosdis.nasa.gov`, `data.bmkg.go.id`,
  `ic.imagery1.arcgis.com`, `modis.ornl.gov`, `api.open-meteo.com`;
- di belakang reverse proxy, teruskan `X-Forwarded-For` (dipakai rate limit per IP)
  dan jangan mem-buffer respons `/api/chat` (streaming).

### Catatan skala

Cache dan rate limit bersifat **in-memory per instance**. Satu instance sudah
memadai untuk beban moderat. Untuk beberapa instance: gunakan penyimpanan
bersama (Redis) atau pindahkan rate limit ke CDN/WAF; cache sumber data tetap
aman (tiap instance memanaskan sendiri).

## 4. Opsional

### Tutupan lahan ESA WorldCover (`services/geo`)

Tanpa ini aplikasi memakai Esri 10 m (sudah cukup untuk kebanyakan kasus).

```bash
cd services/geo
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # isi GEE_SERVICE_ACCOUNT + GEE_KEY_PATH, dan GEO_API_KEY
python check_gee.py      # harus mencetak "GEE OK"
uvicorn app.main:app --port 8001
```

Deploy: `Dockerfile` siap pakai (Cloud Run, Railway, Hugging Face Spaces). Di
platform tanpa filesystem persisten isi `GEE_CREDENTIALS_JSON` (isi JSON key).
**Set `GEO_API_KEY`** pada layanan publik, lalu di `apps/web` isi
`GEO_SERVICE_URL=https://…` (dan `GEO_SERVICE_API_KEY` bila dipakai) — tanpa
API key siapa pun yang tahu URL-nya bisa menghabiskan kuota Earth Engine Anda.

### LandAI penuh (Claude)

Isi `ANTHROPIC_API_KEY` di `apps/web`. Model default `claude-opus-5-5`; ganti lewat
`ANTHROPIC_MODEL` (mis. `claude-sonnet-5-5` atau `claude-haiku-4-5` untuk biaya lebih rendah).
Dengan login (Cognito) aktif, mode ini hanya untuk pengguna login (batas 8 permintaan/menit/IP
dan 150/hari/pengguna). Tanpa kunci, LandAI tetap berjalan dalam mode aturan.

### MCP server untuk asisten AI eksternal

```bash
cd services/mcp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ECOSENTRA_API_URL=https://ecosentra.example.com python server.py
```

Contoh konfigurasi Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ecosentra": {
      "command": "/path/ke/services/mcp/.venv/bin/python",
      "args": ["/path/ke/services/mcp/server.py"],
      "env": { "ECOSENTRA_API_URL": "https://ecosentra.example.com" }
    }
  }
}
```

## Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| Titik api "fetch failed" / timeout | server jauh dari AS: naikkan `NET_ATTEMPT_TIMEOUT_MS`; cek firewall keluar ke `firms.modaps.eosdis.nasa.gov` |
| Login "Gagal terhubung ke server login" | `NEXT_PUBLIC_COGNITO_*` salah/kosong saat build, atau CSP memblokir endpoint; cek konsol browser. Setelah mengubahnya, build ulang |
| `/api/fields` → 503 | `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, atau `DYNAMODB_TABLE` belum diisi |
| `/api/fields` → 500, log menyebut `AccessDeniedException` | role IAM instance belum punya izin DynamoDB (lihat 2.3) |
| `/api/fields` → 401 padahal sudah login | `COGNITO_CLIENT_ID`/`COGNITO_USER_POOL_ID` server tidak sama dengan yang dipakai browser, atau jam server menyimpang jauh |
| Hapus akun gagal | role IAM belum punya `cognito-idp:AdminDeleteUser` |
| Admin tidak bisa menerbitkan peringatan | grup `admin` baru berlaku setelah keluar-masuk lagi |
| Peta kosong / tile gagal | blokir CSP/jaringan ke host tile; lihat `next.config.mjs` (`img-src https:`) |
