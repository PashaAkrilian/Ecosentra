"use client"

import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Leaf, LoaderCircle, MailCheck } from "lucide-react"
import { describeAuthError, useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { safeNextPath } from "@/lib/redirect"

/** Layar yang tampil: form masuk/daftar, kode verifikasi email, atau pengaturan ulang kata sandi. */
type View = "auth" | "confirm" | "reset"

const MIN_PASSWORD = 8

function LoginContent() {
  const { configured, user, loading, signIn, signUp, confirmSignUp, resendCode, startPasswordReset, finishPasswordReset } = useAuth()
  const router = useRouter()
  const next = safeNextPath(useSearchParams().get("next"))

  const [view, setView] = useState<View>("auth")
  const [tab, setTab] = useState("masuk")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false) // reset: kode sudah diminta
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && user) router.replace(next)
  }, [loading, user, next, router])

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (success) setNotice(success)
    } catch (e) {
      setError(describeAuthError(e))
      // Akun ada tapi belum dikonfirmasi: arahkan ke layar kode, bukan hanya menampilkan galat.
      if ((e as { name?: string })?.name === "UserNotConfirmedException") setView("confirm")
    } finally {
      setBusy(false)
    }
  }

  const submitAuth = (event: React.FormEvent) => {
    event.preventDefault()
    if (tab === "masuk") {
      void run(() => signIn(email.trim(), password))
      return
    }
    void run(async () => {
      if (password.length < MIN_PASSWORD) throw Object.assign(new Error(), { name: "InvalidPasswordException" })
      const { confirmed } = await signUp(name.trim(), email.trim(), password)
      if (!confirmed) {
        setView("confirm")
        setNotice(`Kode verifikasi sudah dikirim ke ${email.trim()}. Masukkan kodenya di bawah.`)
      } else {
        await signIn(email.trim(), password)
      }
    })
  }

  const submitConfirm = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await confirmSignUp(email.trim(), code.trim())
      if (password) await signIn(email.trim(), password)
      else {
        setView("auth")
        setTab("masuk")
        setNotice("Akun terkonfirmasi. Silakan masuk.")
      }
    })
  }

  const openReset = () => {
    setView("reset")
    setCodeSent(false)
    setCode("")
    setPassword("")
    setError(null)
    setNotice(null)
  }

  const submitReset = (event: React.FormEvent) => {
    event.preventDefault()
    if (!codeSent) {
      if (!email.trim()) return setError("Isi email Anda terlebih dahulu.")
      void run(async () => {
        await startPasswordReset(email.trim())
        setCodeSent(true)
        setNotice("Jika email terdaftar, kode untuk mengatur ulang kata sandi sudah dikirim.")
      })
      return
    }
    if (password.length < MIN_PASSWORD) return setError(describeAuthError(Object.assign(new Error(), { name: "InvalidPasswordException" })))
    void run(async () => {
      await finishPasswordReset(email.trim(), code.trim(), password)
      setPassword("")
      setCode("")
      setView("auth")
      setTab("masuk")
      setNotice("Kata sandi diperbarui. Silakan masuk dengan kata sandi baru.")
    })
  }

  const feedback = (
    <>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {notice}
        </p>
      )}
    </>
  )

  const backToLogin = (
    <button
      type="button"
      onClick={() => { setView("auth"); setTab("masuk"); setError(null); setNotice(null); setCode("") }}
      className="block w-full text-center text-sm text-emerald-800 underline underline-offset-2"
    >
      Kembali ke halaman masuk
    </button>
  )

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Kembali ke beranda
        </Link>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 rounded-xl bg-emerald-700 p-2.5">
              <Leaf className="h-6 w-6 text-white" aria-hidden />
            </div>
            <CardTitle className="text-2xl">EcoSentra</CardTitle>
            <CardDescription>Masuk untuk menyimpan lahan dan skenario Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            {!configured ? (
              <div role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Login belum dikonfigurasi</p>
                <p className="mt-1">
                  Instalasi ini berjalan dalam mode demo. Semua data publik tetap bisa dipakai tanpa akun.{" "}
                  <Link href="/help#mode-demo" className="font-medium underline underline-offset-2">
                    Cara mengaktifkan login
                  </Link>
                  .
                </p>
                <Button asChild className="mt-3">
                  <Link href="/dashboard">Lanjut tanpa akun</Link>
                </Button>
              </div>
            ) : view === "confirm" ? (
              <form onSubmit={submitConfirm} className="space-y-4" noValidate>
                <p className="text-sm text-muted-foreground">Masukkan kode verifikasi 6 digit yang dikirim ke email Anda.</p>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="code">Kode verifikasi</Label>
                  <Input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                {feedback}
                <Button type="submit" className="w-full" disabled={busy || !email || !code}>
                  {busy && <LoaderCircle className="animate-spin" aria-hidden />} Konfirmasi
                </Button>
                <button
                  type="button"
                  disabled={busy || !email}
                  onClick={() => void run(() => resendCode(email.trim()), "Kode baru sudah dikirim.")}
                  className="block w-full text-center text-sm text-emerald-800 underline underline-offset-2"
                >
                  Kirim ulang kode
                </button>
                {backToLogin}
              </form>
            ) : view === "reset" ? (
              <form onSubmit={submitReset} className="space-y-4" noValidate>
                <p className="text-sm text-muted-foreground">
                  {codeSent ? "Masukkan kode dari email dan kata sandi baru Anda." : "Kami akan mengirim kode ke email Anda."}
                </p>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} disabled={codeSent} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {codeSent && (
                  <>
                    <div>
                      <Label htmlFor="code">Kode verifikasi</Label>
                      <Input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="password">Kata sandi baru</Label>
                      <Input id="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
                      <p className="mt-1 text-xs text-muted-foreground">Minimal {MIN_PASSWORD} karakter, dengan huruf besar, huruf kecil, dan angka.</p>
                    </div>
                  </>
                )}
                {feedback}
                <Button type="submit" className="w-full" disabled={busy || !email || (codeSent && (!code || !password))}>
                  {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                  {codeSent ? "Atur ulang kata sandi" : "Kirim kode"}
                </Button>
                {backToLogin}
              </form>
            ) : (
              <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); setNotice(null) }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="masuk">Masuk</TabsTrigger>
                  <TabsTrigger value="daftar">Daftar</TabsTrigger>
                </TabsList>

                <form onSubmit={submitAuth} className="mt-5 space-y-4" noValidate>
                  <TabsContent value="daftar" className="mt-0">
                    <Label htmlFor="name">Nama</Label>
                    <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </TabsContent>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="password">Kata sandi</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={tab === "masuk" ? "current-password" : "new-password"}
                      required
                      minLength={MIN_PASSWORD}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {tab === "daftar" && (
                      <p className="mt-1 text-xs text-muted-foreground">Minimal {MIN_PASSWORD} karakter, dengan huruf besar, huruf kecil, dan angka.</p>
                    )}
                  </div>

                  {feedback}

                  <Button type="submit" className="w-full" disabled={busy || !email || !password}>
                    {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                    {tab === "masuk" ? "Masuk" : "Buat akun"}
                  </Button>
                  {tab === "masuk" && (
                    <button type="button" onClick={openReset} className="block w-full text-center text-sm text-emerald-800 underline underline-offset-2" disabled={busy}>
                      Lupa kata sandi?
                    </button>
                  )}
                </form>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
