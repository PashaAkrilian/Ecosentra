# services/ml

**Tidak ada layanan ML di sini — dan itu disengaja.**

Aplikasi EcoSentra tidak memakai model machine learning sendiri: analisis tutupan lahan memakai
dataset hasil klasifikasi yang sudah matang (Esri / Impact Observatory 10 m, dan opsional
ESA WorldCover lewat `services/geo`).

Eksperimen pelatihan model segmentasi SegFormer ada di
[`experiments/segformer-openearthmap/`](../../experiments/segformer-openearthmap/run-01-baseline/RUN_INFO.md):
run-01 hanya mencapai akurasi piksel **12–23%** (under-training). Run-02 (SegFormer-b1, GPU Kaggle) mencapai
**77,9%** dan mIoU **0,674** pada validasi OpenEarthMap
([`RUN_INFO.md`](../../experiments/segformer-openearthmap/run-02-kaggle/RUN_INFO.md)), tetapi belum divalidasi di area
Indonesia, sehingga sengaja belum dibuatkan layanan serving.

## Jika ingin melanjutkan

1. Ukur model run-02 pada area uji Indonesia (bandingkan dengan Esri/ESA) dan petakan kelasnya ke kelas aplikasi;
   latih ulang/fine-tune bila hasilnya kurang.
2. Baru setelah itu bangun layanan serving (FastAPI membungkus bobot Hugging Face) di folder ini
   dan sambungkan lewat `apps/web/server/sources/landcover.ts`.
3. Tanpa langkah 1, jangan menyajikan keluaran model ke pengguna.

Bobot model (`*.pth`, `*.safetensors`) tidak ikut Git (lihat `.gitignore`).
