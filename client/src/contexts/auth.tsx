/**
 * Auth context for VoidBackups.
 *
 * Passkey-only auth — no OAuth, no passwords.
 * First visit → setup wizard (create passkey).
 * Subsequent visits → passkey login.
 */

import * as React from "react"
import * as api from "@/lib/api"
import {
  prepareRegistrationOptions,
  prepareAuthenticationOptions,
  encodeRegistrationResponse,
  encodeAuthenticationResponse,
} from "@/lib/webauthn"

type AuthStatus = "loading" | "ready" | "setup"

interface AuthContextValue {
  status: AuthStatus
  user: { id: string; name: string } | null
  isSetup: boolean
  register: (name: string) => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading")
  const [user, setUser] = React.useState<{ id: string; name: string } | null>(null)
  const [isSetup, setIsSetup] = React.useState(false)

  // Check auth status on load
  React.useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const authStatus = await api.getAuthStatus()
        if (cancelled) return
        setIsSetup(authStatus.isSetup)

        if (!authStatus.isSetup) {
          setStatus("setup")
          return
        }

        // Try to get current user
        const me = await api.getMe()
        if (cancelled) return
        if (me?.user) {
          setUser(me.user)
          setStatus("ready")
        } else {
          setStatus("ready")
        }
      } catch {
        if (!cancelled) setStatus("ready")
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  const register = React.useCallback(async (name: string) => {
    // 1. Get registration options from server
    const options = await api.startRegistration(name)
    const challenge = options.challenge

    // 2. Prepare options for the browser
    const preparedOptions = prepareRegistrationOptions(options)

    // 3. Trigger the browser's passkey ceremony
    const credential = await navigator.credentials.create({
      publicKey: preparedOptions,
    })
    if (!credential) throw new Error("Passkey creation was cancelled")

    // 4. Encode the response and send to server
    const encoded = encodeRegistrationResponse(credential as PublicKeyCredential)
    const result = await api.completeRegistration(encoded, challenge as string, name)

    setUser(result.user)
    setIsSetup(true)
    setStatus("ready")
  }, [])

  const login = React.useCallback(async () => {
    // 1. Get authentication options from server
    const options = await api.startLogin()
    const challenge = options.challenge

    // 2. Prepare options for the browser
    const preparedOptions = prepareAuthenticationOptions(options)

    // 3. Trigger the browser's passkey ceremony
    const credential = await navigator.credentials.get({
      publicKey: preparedOptions,
    })
    if (!credential) throw new Error("Passkey authentication was cancelled")

    // 4. Encode the response and send to server
    const encoded = encodeAuthenticationResponse(credential as PublicKeyCredential)
    const result = await api.completeLogin(encoded, challenge as string)

    setUser(result.user)
    setStatus("ready")
  }, [])

  const logout = React.useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const refresh = React.useCallback(async () => {
    const me = await api.getMe()
    setUser(me?.user ?? null)
  }, [])

  const value = React.useMemo(
    () => ({ status, user, isSetup, register, login, logout, refresh }),
    [status, user, isSetup, register, login, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
