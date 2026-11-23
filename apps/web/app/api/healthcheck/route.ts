import { NextResponse } from "next/server"
import { isAuthConfigured, isDatabaseConfigured } from "@/server/aws"

/**
 * Status integrasi (tanpa membocorkan nilai rahasia apa pun) — dipakai
 * halaman Pengaturan dan untuk monitoring uptime.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      time: new Date().toISOString(),
      integrations: {
        auth: isAuthConfigured(),
        authClient: Boolean(process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID),
        database: isDatabaseConfigured(),
        geoService: Boolean(process.env.GEO_SERVICE_URL),
        llm: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
