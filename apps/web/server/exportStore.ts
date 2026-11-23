import "server-only"
import { randomBytes } from "node:crypto"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/**
 * Ekspor titik api ke S3 (opsional). Kalau EXPORT_BUCKET di-set, berkas diunggah lalu pengguna diarahkan ke
 * URL unduhan bertanda tangan yang berlaku singkat; kalau tidak, route mengirim berkas langsung (perilaku lama).
 * Bucket sebaiknya privat dengan aturan lifecycle yang menghapus objek `exports/` setelah 1 hari.
 */
export const exportBucket = () => process.env.EXPORT_BUCKET || null

const URL_TTL_SECONDS = 300

let client: S3Client | undefined
function s3() {
  client ??= new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-2",
    // Hanya untuk uji lokal dengan emulator (Moto): jangan diisi di produksi.
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
  })
  return client
}

/** Unggah `body` dan kembalikan URL unduhan sementara yang memaksa nama berkas & jenis konten. */
export async function storeExport(bucket: string, filename: string, contentType: string, body: string): Promise<string> {
  const key = `exports/${Date.now()}-${randomBytes(4).toString("hex")}/${filename}` // acak: tidak bisa ditebak
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: URL_TTL_SECONDS },
  )
}
