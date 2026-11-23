"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import * as cognito from "@/lib/cognitoClient"
import type { SessionUser } from "@/lib/cognitoClient"

interface AuthContextValue {
  /** false = env Cognito client belum diisi -> mode demo tanpa login. */
  configured: boolean
  user: SessionUser | null
  /** true sampai status login awal diketahui. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** `confirmed: false` = kode verifikasi sudah dikirim ke email dan harus dimasukkan lewat `confirmSignUp`. */
  signUp: (name: string, email: string, password: string) => Promise<{ confirmed: boolean }>
  confirmSignUp: (email: string, code: string) => Promise<void>
  resendCode: (email: string) => Promise<void>
  startPasswordReset: (email: string) => Promise<void>
  finishPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>
  signOut: () => Promise<void>
  /** ID token untuk header Authorization ke API routes, atau null kalau belum login. */
  getIdToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(cognito.isAuthClientConfigured)

  useEffect(() => {
    if (!cognito.isAuthClientConfigured) return
    setUser(cognito.currentUser())
    setLoading(false)
    return cognito.onSessionChange(() => setUser(cognito.currentUser()))
  }, [])

  const getIdToken = useCallback(async () => {
    const token = await cognito.getIdToken()
    if (!token) setUser(null) // sesi habis di server: tampilan ikut keluar
    return token
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: cognito.isAuthClientConfigured,
      user,
      loading,
      getIdToken,
      signIn: async (email, password) => setUser(await cognito.signIn(email, password)),
      signUp: cognito.signUp,
      confirmSignUp: cognito.confirmSignUp,
      resendCode: cognito.resendCode,
      startPasswordReset: cognito.startPasswordReset,
      finishPasswordReset: cognito.finishPasswordReset,
      signOut: async () => {
        await cognito.signOut()
        setUser(null)
      },
    }),
    [user, loading, getIdToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth harus dipakai di dalam <AuthProvider>.")
  return context
}

/** Pesan error Cognito yang ramah pengguna (Bahasa Indonesia), dipetakan dari nama pengecualiannya. */
export function describeAuthError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? ""
  const messages: Record<string, string> = {
    NotAuthorizedException: "Email atau kata sandi salah.",
    UserNotFoundException: "Email atau kata sandi salah.",
    UserNotConfirmedException: "Akun belum dikonfirmasi. Masukkan kode verifikasi yang dikirim ke email Anda.",
    UsernameExistsException: "Email ini sudah terdaftar. Silakan masuk.",
    InvalidPasswordException: "Kata sandi belum memenuhi syarat (minimal 8 karakter, huruf besar, huruf kecil, dan angka).",
    InvalidParameterException: "Data yang dimasukkan tidak valid. Periksa email dan kata sandi.",
    CodeMismatchException: "Kode verifikasi salah.",
    ExpiredCodeException: "Kode verifikasi sudah kedaluwarsa. Minta kode baru.",
    LimitExceededException: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.",
    TooManyRequestsException: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.",
    TooManyFailedAttemptsException: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.",
    NetworkError: "Gagal terhubung ke server login. Periksa koneksi internet.",
    TypeError: "Gagal terhubung ke server login. Periksa koneksi internet.",
  }
  if (messages[name]) return messages[name]
  // Error buatan sendiri (nama "Error") sudah berbahasa Indonesia; pengecualian SDK yang tak dikenal dirangkum.
  return error instanceof Error && name === "Error" ? error.message : "Terjadi kesalahan saat login. Coba lagi."
}
