const isDev = process.env.NODE_ENV !== "production"

// Endpoint Cognito khusus pengembangan/uji lokal (emulator): kalau di-set, izinkan koneksi ke endpoint itu saja.
// Nilai NEXT_PUBLIC_* ini ikut tertanam saat build.
const cognitoEndpoint = process.env.NEXT_PUBLIC_COGNITO_ENDPOINT
// Host Cognito ditulis EKSPLISIT per region. CSP hanya mengizinkan wildcard di label paling kiri ("*.x.com");
// "cognito-idp.*.amazonaws.com" tidak sah, diabaikan browser, dan membuat semua login gagal.
const cognitoRegion = process.env.NEXT_PUBLIC_COGNITO_REGION

// Content-Security-Policy: halaman ini memuat tile peta dari banyak server
// (Esri, OpenStreetMap, OpenTopoMap, NASA GIBS) -> img-src mengizinkan https:.
// Login memanggil API Cognito (cognito-idp.<region>.amazonaws.com) langsung dari browser.
// 'unsafe-inline' pada script dibutuhkan skrip hidrasi Next.js
// tanpa nonce; 'unsafe-eval' hanya saat development (React Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${cognitoRegion ? ` https://cognito-idp.${cognitoRegion}.amazonaws.com` : ""}${cognitoEndpoint ? ` ${cognitoEndpoint}` : ""}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Server mandiri (node server.js) untuk image Docker kecil di EC2.
  output: "standalone",
  images: {
    unoptimized: true,
  },
  async redirects() {
    // Halaman "Jasa Ekosistem" (data contoh) digantikan "Profil Ekosistem" berbasis data nyata.
    return [{ source: "/eco-services", destination: "/ecosystem", permanent: true }]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ]
  },
}

export default nextConfig
