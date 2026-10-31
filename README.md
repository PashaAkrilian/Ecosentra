# EcoSentra

**Kondisi lahan Indonesia hari ini, dalam satu layar.**

Titik api, gempa, cuaca, kehijauan vegetasi, dan tutupan lahan dari satelit dan lembaga resmi. Semuanya langsung dari sumbernya, dengan keterangan sumber dan waktu ambil. Tanpa angka karangan.

**[Buka ecosentra.site](https://ecosentra.site)** · [![CI](https://github.com/PashaAkrilian/Ecosentra/actions/workflows/ci.yml/badge.svg)](https://github.com/PashaAkrilian/Ecosentra/actions/workflows/ci.yml) · [Lisensi MIT](./License.txt)

---

## Kenapa EcoSentra

- **Langsung bisa dipakai.** Tidak perlu daftar. Buka situsnya, data sudah tampil.
- **Data asli, jelas asalnya.** NASA FIRMS, BMKG, Open-Meteo, MODIS, dan citra Esri. Setiap angka mencantumkan sumber dan waktunya.
- **Jujur soal batasnya.** Yang belum akurat atau belum tersedia ditulis apa adanya di halaman Bantuan.
- **Ada asisten.** LandAI menjawab pertanyaan soal lokasi memakai data yang sama dengan yang Anda lihat di peta.

## Isi aplikasi

| Halaman | Gunanya |
| --- | --- |
| Dashboard | Ringkasan 24 jam dan tren 7 hari: titik api, gempa, peringatan aktif |
| Peta & Analisis | Klik lokasi mana pun untuk melihat cuaca, kehijauan, dan tutupan lahannya |
| Peringatan Bencana | Gabungan gempa, klaster titik api, dan peringatan dari admin |
| Profil Ekosistem | Ringkasan per provinsi |
| Lahan Saya | Simpan dan pantau lahan Anda sendiri (perlu login) |
| Pendukung Keputusan | Bandingkan skenario pengelolaan lahan |
| LandAI | Tanya jawab soal lokasi dan kondisi lahan |

Data bisa diekspor ke GeoJSON, CSV, dan KML. Ada juga server MCP supaya asisten AI lain bisa memakai data yang sama.

## Coba di komputer sendiri

```bash
cd apps/web
npm ci
npm run dev
```

Buka `http://localhost:8080`. Tanpa pengaturan tambahan, peta, dashboard, dan peringatan sudah jalan memakai data publik. Login dan penyimpanan lahan butuh project Firebase sendiri.

## Dokumentasi

[Arsitektur](docs/architecture.md) · [Sumber data](docs/data-sources.md) · [API](docs/api.md) · [Deploy](docs/deployment.md) · [Alur kontribusi](docs/git-workflow.md) · [Keamanan](docs/security-checklist.md)

## Ikut berkontribusi

Buat branch dari `develop`, buka Pull Request, dan isi templatenya. Rilis berjalan bertahap `develop` → `staging` → `main`. Detailnya ada di [alur kontribusi](docs/git-workflow.md).

Dikembangkan oleh Tim EcoSentra, diketuai [PashaAkrilian](https://github.com/PashaAkrilian).
