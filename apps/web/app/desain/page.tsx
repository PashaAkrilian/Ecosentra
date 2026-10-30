import type { Metadata } from "next"
import { Bricolage_Grotesque, Public_Sans } from "next/font/google"
import Link from "next/link"
import { AssistantProvider } from "@/components/assistant-context"
import { AskLandAI } from "@/components/ask-land-ai"
import { FireMap } from "@/components/landing/fire-map"
import { indonesiaOutline } from "@/components/landing/indonesia-outline"

export const metadata: Metadata = {
  title: { absolute: "EcoSentra — Kondisi lahan Indonesia hari ini" },
  robots: { index: false }, // pratinjau desain
}

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" })
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" })

const REPO_URL = "https://github.com/PashaAkrilian/Ecosentra"

const SECTIONS = [
  {
    href: "/maps",
    title: "Peta & analisis",
    text: "Titik api, gempa, NDVI, suhu permukaan, dan tutupan lahan 10 m dalam satu peta. Klik titik mana pun untuk analisis lengkapnya, lalu ekspor ke GeoJSON, CSV, atau KML.",
  },
  { href: "/dashboard", title: "Dashboard", text: "Ringkasan 24 jam dan tren 7 hari: titik api per provinsi, gempa terbaru, peringatan aktif." },
  { href: "/disaster-alerts", title: "Peringatan bencana", text: "Peringatan otomatis dari gempa BMKG dan klaster titik api, dengan ambang yang terbuka." },
  { href: "/ecosystem", title: "Profil ekosistem", text: "Tutupan lahan dan kepadatan titik api untuk 34 provinsi, dihitung dari citra satelit." },
  { href: "/fields", title: "Lahan saya", text: "Simpan lokasi kebun atau sawah, lalu pantau vegetasi, cuaca, dan titik api di sekitarnya." },
  { href: "/decision-support", title: "Pendukung keputusan", text: "Catat skenario pengelolaan lahan dan lihat konteks data terkini serta rekomendasi indikatif." },
]

const SOURCES = [
  ["NASA FIRMS", "titik api VIIRS 375 m"],
  ["BMKG", "gempa bumi"],
  ["Esri / Impact Observatory", "tutupan lahan Sentinel-2 10 m"],
  ["NASA MODIS", "NDVI dan suhu permukaan"],
  ["Open-Meteo", "cuaca dan kelembapan tanah"],
]

export default function Desain() {
  return (
    <AssistantProvider>
      <div
        className={`${display.variable} ${body.variable} min-h-screen font-[family-name:var(--font-body)] text-[var(--ink)] [&_.font-display]:font-[family-name:var(--font-display)]`}
        style={
          {
            background: "var(--ash)",
            "--ash": "#EDF0EA",
            "--ink": "#1E2620",
            "--muted": "#56615A",
            "--canopy": "#2E6B4E",
            "--land": "#DCE4D9",
            "--land-edge": "#B7C4B8",
            "--rule": "#C9D2C8",
          } as React.CSSProperties
        }
      >
        <header className="mx-auto flex max-w-6xl items-baseline justify-between px-6 pt-6">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight">
            EcoSentra
          </Link>
          <nav aria-label="Navigasi beranda" className="flex items-center gap-5 text-sm">
            <Link href="/help" className="hidden hover:underline sm:inline">
              Metodologi
            </Link>
            <Link href="/login" className="hover:underline">
              Masuk
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md bg-[var(--canopy)] px-4 py-2 font-medium text-white hover:bg-[#245840] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canopy)]"
            >
              Buka aplikasi
            </Link>
          </nav>
        </header>

        <main>
          <section className="mx-auto max-w-6xl px-6 pb-14 pt-8 sm:pt-12">
            <h1 className="font-display max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Kondisi lahan Indonesia hari ini
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
              Titik api, gempa, vegetasi, dan tutupan lahan dari NASA, BMKG, dan Esri. Setiap angka mencantumkan sumber dan waktu
              pengambilannya.
            </p>
            <div className="mt-8">
              <FireMap outline={indonesiaOutline()} />
            </div>
          </section>

          <section aria-labelledby="mulai" className="mx-auto max-w-6xl px-6 py-14">
            <h2 id="mulai" className="font-display text-3xl font-semibold tracking-tight">
              Mulai dari yang Anda butuhkan
            </h2>
            <ul className="mt-8 border-b border-[var(--rule)]">
              {SECTIONS.map(({ href, title, text }, i) => (
                <li key={href} className="border-t border-[var(--rule)]">
                  <Link
                    href={href}
                    className="group grid gap-1 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--canopy)] sm:grid-cols-[17rem_1fr] sm:gap-8"
                  >
                    <span
                      className={`font-display font-semibold tracking-tight group-hover:text-[var(--canopy)] group-hover:underline group-hover:underline-offset-4 ${
                        i === 0 ? "text-3xl" : "text-xl"
                      }`}
                    >
                      {title}
                    </span>
                    <span className={`max-w-xl text-[var(--muted)] ${i === 0 ? "text-base" : "text-sm"} leading-relaxed`}>{text}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              LandAI, asisten di pojok kanan bawah, menjawab pertanyaan seperti “berapa titik api di Kalimantan Tengah hari ini?”
              dari sumber data yang sama dengan dashboard. Angkanya tidak dikarang.
            </p>
          </section>

          <section aria-labelledby="data" className="mx-auto grid max-w-6xl gap-12 px-6 py-14 lg:grid-cols-2">
            <div>
              <h2 id="data" className="font-display text-3xl font-semibold tracking-tight">
                Dari mana datanya
              </h2>
              <p className="mt-3 max-w-md text-[var(--muted)]">EcoSentra tidak menyimpan citra sendiri. Semua diambil langsung dari penyedia terbuka.</p>
              <dl className="mt-6 max-w-md border-b border-[var(--rule)]">
                {SOURCES.map(([name, what]) => (
                  <div key={name} className="flex justify-between gap-4 border-t border-[var(--rule)] py-3 text-sm">
                    <dt className="font-medium">{name}</dt>
                    <dd className="text-right text-[var(--muted)]">{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight">Batas yang perlu Anda tahu</h2>
              <p className="mt-3 max-w-md leading-relaxed text-[var(--muted)]">
                Titik api adalah deteksi satelit, bukan kebakaran terverifikasi. NDVI bukan diagnosis kesehatan tanaman. Tutupan
                lahan adalah klasifikasi otomatis. Awan sering menutupi Indonesia, dan data yang terhalang kami tandai.
              </p>
              <p className="mt-4 max-w-md leading-relaxed text-[var(--muted)]">
                Ambang peringatan, lisensi, dan cara hitung ada di{" "}
                <Link href="/help" className="font-medium text-[var(--canopy)] underline underline-offset-2">
                  halaman Metodologi
                </Link>
                . Kodenya open source (MIT).
              </p>
            </div>
          </section>
        </main>

        <footer className="mt-10 border-t border-[var(--rule)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-[var(--muted)] sm:flex-row sm:justify-between">
            <p>© 2025–2026 Tim EcoSentra. Lisensi MIT. Proyek GEMASTIK 2025.</p>
            <nav aria-label="Tautan kaki" className="flex gap-5">
              <Link href="/help" className="hover:underline">
                Metodologi
              </Link>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
                GitHub
              </a>
              <Link href="/login" className="hover:underline">
                Masuk
              </Link>
            </nav>
          </div>
        </footer>

        <AskLandAI />
      </div>
    </AssistantProvider>
  )
}
