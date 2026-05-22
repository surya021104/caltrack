/**
 * authService.js
 * Centralised authentication API calls.
 *
 * Tokens are managed as httpOnly cookies by the server — this file never
 * reads, writes, or stores them.  Every call uses credentials:"include" so
 * the browser automatically attaches and receives cookies.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api"

async function fetchJSON(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const headers = new Headers(options.headers ?? {})
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(url, {
    ...options,
    credentials: "include",   // always send/receive cookies
    headers,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text || null }

  if (!res.ok) throw { status: res.status, body: data }
  return data
}

/**
 * Login — server sets qt_access + qt_refresh httpOnly cookies in response.
 * Returns { success: true } — no tokens in the body.
 */
export async function apiLogin(identifier, password) {
  return fetchJSON("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username: identifier, password }),
  })
}

/**
 * Fetch the current authenticated user from /auth/me/.
 * Browser sends the qt_access cookie automatically.
 * Returns user object or null (null means unauthenticated).
 */
export async function apiFetchMe() {
  try {
    return await fetchJSON("/auth/me/")
  } catch {
    return null
  }
}

/**
 * Ask the server to silently rotate the access cookie using the refresh cookie.
 * Returns true on success, false if the session has fully expired.
 */
export async function apiRefreshToken() {
  try {
    const data = await fetchJSON("/auth/refresh/", { method: "POST" })
    return !!data?.success
  } catch {
    return false
  }
}

/**
 * Register a new organisation + admin user.
 * Server sets auth cookies in the response.
 * Returns { success, user }.
 */
export async function apiRegister(payload) {
  return fetchJSON("/auth/register/", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * Google OAuth — server exchanges the Google access token, then sets cookies.
 */
export async function apiGoogleLogin(googleAccessToken) {
  return fetchJSON("/auth/google/", {
    method: "POST",
    body: JSON.stringify({ access_token: googleAccessToken }),
  })
}

/**
 * Request password reset email.
 */
export async function apiPasswordResetRequest(email) {
  return fetchJSON("/auth/password-reset/request/", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

/**
 * Confirm password reset with token.
 */
export async function apiPasswordResetConfirm(payload) {
  return fetchJSON("/auth/password-reset/confirm/", {
    method: "POST",
    body: JSON.stringify(payload), // { uid, token, new_password }
  })
}

// ── Error normalization ───────────────────────────────────────────────────────

/**
 * Logout — tells the server to clear both auth cookies.
 */
export async function apiLogout() {
  try {
    await fetchJSON("/auth/logout/", { method: "POST" })
  } catch {
    // Even if the network call fails, the client side clears user state
  }
}

// ── Error normalization ───────────────────────────────────────────────────────
export function extractAuthError(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback
  const body = err?.body

  if (!body) {
    if (err instanceof TypeError) return "Cannot connect to server. Check your network."
    return fallback
  }

  if (typeof body === "string") {
    if (body.trim().startsWith("<")) return "Server error. Please try again shortly."
    return body
  }

  if (typeof body === "object") {
    if (typeof body.detail === "string") return body.detail
    const first = Object.values(body)[0]
    if (Array.isArray(first) && first.length > 0) return first[0]
    if (typeof first === "string") return first
  }

  return fallback
}
