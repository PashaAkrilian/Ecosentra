# run-02-kaggle — SegFormer-b1 OpenEarthMap

**Tanggal:** 2026-10-31 · **Tempat:** Kaggle (GPU), kernel `ecosentra-segformer-oem-run02` · **Kode:** `train.py`

## Konfigurasi
- Model: `nvidia/mit-b1` (encoder ImageNet) + decode head baru, 9 kelas (background, bareland, rangeland, developed, road, tree, water, agriculture, building)
- Data: OpenEarthMap (Kaggle `aletbm/global-land-cover-mapping-openearthmap`): 2.303 gambar latih, 384 validasi
- 30 epoch, batch 12, crop acak 512 + rot90/flip, AdamW (lr 6e-5 backbone, 6e-4 head), warmup 200 langkah lalu poly decay, AMP fp16, tile < 512 px di-pad dengan label diabaikan
- Model terbaik dipilih per epoch dari 1/4 set validasi, lalu dievaluasi pada seluruh 384 gambar validasi

## Hasil (validasi penuh, 384 gambar)
| | run-01 | run-02 |
|---|---|---|
| Akurasi piksel | 12–23% | **77,9%** |
| mIoU (9 kelas) | tidak diukur | **0,674** |
| mIoU tanpa `background` (8 kelas) | | 0,639 |

IoU per kelas: background 0,957 · bareland 0,474 · rangeland 0,553 · developed 0,544 · road 0,568 · tree 0,686 · water 0,769 · agriculture 0,758 · building 0,756. Detail per epoch di `history.json`, ringkasan di `metrics.json`.

## Catatan kejujuran
- Pemilihan epoch dan evaluasi akhir memakai set validasi yang sama (tidak ada set uji terpisah dengan label), jadi angkanya sedikit optimistis.
- Kota di data latih dan validasi OpenEarthMap overlap, dan citra Indonesia hanya sebagian kecil. Belum ada pengukuran di area Indonesia: **jangan sajikan keluaran model ke pengguna** sebelum itu.
- Kelas model (9 kelas OpenEarthMap) tidak sama dengan kelas Esri/ESA yang dipakai aplikasi; perlu pemetaan kelas bila nanti dipakai.

## Berkas
`model/` (config.json + model.safetensors, ~55 MB) **tidak ikut Git** (lihat `.gitignore`); tersimpan lokal dan di keluaran kernel Kaggle.
