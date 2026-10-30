import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Bricolage_Grotesque, Public_Sans } from "next/font/google"
import { AuthProvider } from "@/components/auth-provider"
import "./globals.css"

const body = Public_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" })
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" })

export const metadata: Metadata = {
  title: {
    default: "EcoSentra — Analisis Lahan & Ekosistem Indonesia",
    template: "%s · EcoSentra",
  },
  description:
    "Pemantauan titik api, gempa, tutupan lahan, dan kesehatan vegetasi Indonesia dari data satelit terbuka (NASA FIRMS, BMKG, MODIS, ESA/Esri Land Cover).",
}

export const viewport: Viewport = {
  themeColor: "#2E6B4E",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={`${body.variable} ${display.variable} font-sans`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
