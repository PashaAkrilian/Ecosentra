# Video promosi EcoSentra

Hasil: `out/EcoSentra_Promo.mp4` (1920x1080, 30 fps). Dibuat dengan [Remotion](https://remotion.dev).

```bash
npm ci
node scripts/gen-sfx.mjs
npx remotion render src/index.ts Promo out/EcoSentra_Promo.mp4 --codec h264 --crf 17
```

Angka di video diambil dari cuplikan layar 28 November 2026.
Efek suara berasal dari skrip contoh [claude-remotion-skill](https://github.com/haidrrrry/claude-remotion-skill) (MIT).
