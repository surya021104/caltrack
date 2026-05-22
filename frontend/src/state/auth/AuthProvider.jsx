/**
 * AuthProvider.jsx
 * Central authentication state for the application.
 *
 * Tokens are httpOnly cookies — this file never sees them.
 * Auth state is derived solely from the /auth/me/ endpoint:
 *   - If it returns a user   → authenticated
 *   - If it returns null/401 → not authenticated, redirect to /login
 */
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  apiLogin,
  apiFetchMe,
  apiRegister,
  apiGoogleLogin,
  apiLogout,
  extractAuthError,
} from "../../api/authService.js"
import { AuthContext } from "./AuthContext.js"

export function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(false)
  const [user, setUser]       = useState(null)

  // ── Rehydrate user state from /auth/me/ ───────────────────────────────────
  // The browser sends the httpOnly cookie automatically — we just need to
  // check whether the server accepts it.

  const refreshMe = useCallback(async () => {
    const me = await apiFetchMe()

    if (me?.username && me?.role && me?.company) {
      const u = {
        username:  me.username,
        email:     me.email      ?? "",
        firstName: me.first_name ?? "",
        lastName:  me.last_name  ?? "",
        role:      me.role,
        companyId: me.company,
      }
      setUser(u)
      if (me.company_name) {
        localStorage.setItem("quicktims.orgName", me.company_name)
        window.dispatchEvent(new CustomEvent("quicktims:orgName"))
      }
      return u
    } else {
      // Not authenticated (cookies missing, expired, or server rejected them)
      setUser(null)
      return null
    }
  }, [])

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (identifier, password) => {
      await apiLogin(identifier, password)   // server sets cookies
      return await refreshMe()                      // fetch user from /auth/me/
    },
    [refreshMe]
  )

  // ── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(
    async (payload) => {
      await apiRegister(payload)   // server sets cookies
      return await refreshMe()
    },
    [refreshMe]
  )

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const loginWithGoogle = useCallback(
    async (googleAccessToken) => {
      await apiGoogleLogin(googleAccessToken)   // server sets cookies
      return await refreshMe()
    },
    [refreshMe]
  )

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await apiLogout()                                   // server clears cookies
    localStorage.removeItem("quicktims.orgName")
    setUser(null)
  }, [])

  // ── Bootstrap on mount ────────────────────────────────────────────────────
  useEffect(() => {
    refreshMe().finally(() => setIsReady(true))
  }, [refreshMe])

  // ── Session expiry event (fired by API client on unrecoverable 401) ───────
  useEffect(() => {
    const handle = async () => {
      await apiLogout()
      localStorage.removeItem("quicktims.orgName")
      setUser(null)
    }
    window.addEventListener("quicktims:session-expired", handle)
    return () => window.removeEventListener("quicktims:session-expired", handle)
  }, [])

  // ── Context value ─────────────────────────────────────────────────────────
  const value = useMemo(
    () => ({ isReady, user, login, register, loginWithGoogle, logout, refreshMe }),
    [isReady, user, login, register, loginWithGoogle, logout, refreshMe]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
