import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Regresi: "connect-src https://cognito-idp.*.amazonaws.com" (wildcard di tengah host) tidak sah di CSP, diabaikan
 * browser, dan memblokir semua login di produksi. Header CSP dibaca dari next.config.mjs yang SESUNGGUHNYA.
 */
async function loadCsp(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "")
    else vi.stubEnv(k, v)
  }
  const config = (await import("../../next.config.mjs")).default as { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> }
  const rules = await config.headers()
  const csp = rules.flatMap((r) => r.headers).find((h) => h.key === "Content-Security-Policy")!.value
  const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `))!.split(/\s+/).slice(1)
  return { csp, directive }
}

afterEach(() => vi.unstubAllEnvs())

/** Sumber host CSP yang sah: kata kunci, skema, atau host dengan wildcard HANYA di label paling kiri. */
const VALID_SOURCE = /^('self'|'none'|'unsafe-inline'|'unsafe-eval'|data:|blob:|https?:|(https?:\/\/)?(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?)$/

describe("Content-Security-Policy (next.config.mjs)", () => {
  it("mengizinkan host Cognito EKSPLISIT sesuai region build", async () => {
    const { directive } = await loadCsp({ NEXT_PUBLIC_COGNITO_REGION: "ap-southeast-2" })
    expect(directive("connect-src")).toContain("https://cognito-idp.ap-southeast-2.amazonaws.com")
  })

  it("tidak memuat wildcard di tengah host pada direktif mana pun", async () => {
    const { directive } = await loadCsp({ NEXT_PUBLIC_COGNITO_REGION: "ap-southeast-2", NEXT_PUBLIC_COGNITO_ENDPOINT: "http://127.0.0.1:5556" })
    for (const name of ["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "frame-src"]) {
      for (const source of directive(name)) {
        expect(source, `${name}: ${source}`).toMatch(VALID_SOURCE)
        expect(source, `${name}: wildcard tengah host`).not.toMatch(/[^/]\*|\.\*\./)
      }
    }
  })

  it("tanpa region (mode demo) tidak membuka host Cognito apa pun", async () => {
    const { directive } = await loadCsp({ NEXT_PUBLIC_COGNITO_REGION: undefined, NEXT_PUBLIC_COGNITO_ENDPOINT: undefined })
    expect(directive("connect-src")).toEqual(["'self'"])
  })

  it("endpoint emulator hanya masuk bila diisi", async () => {
    const { directive } = await loadCsp({ NEXT_PUBLIC_COGNITO_REGION: "ap-southeast-2", NEXT_PUBLIC_COGNITO_ENDPOINT: "http://127.0.0.1:5556" })
    expect(directive("connect-src")).toContain("http://127.0.0.1:5556")
  })
})
