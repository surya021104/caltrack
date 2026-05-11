import { getTokens, setTokens } from "../state/auth/tokens.js"
import { isJwtExpired } from "../state/auth/jwt.js"
import { getMock } from "./mockData.js"

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api"

// Track offline state so banner can be shown once
let _offline = false
export function isOffline() { return _offline }

// Deduplicate concurrent GET requests
const _pendingRequests = new Map()

async function safeJson(res) {
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) }
  catch { return text }
}

async function refreshAccessToken(tokens) {
  const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: tokens.refresh })
  })
  if (!res.ok) return null
  const data = await safeJson(res)
  if (!data?.access) return null
  return { ...tokens, access: data.access }
}

export async function apiRequest(path, init = {}, attemptRefresh = true) {
  // Deduplicate GET requests only
  const method = (init.method || "GET").toUpperCase()
  const cacheKey = method === "GET" ? path + JSON.stringify(init.params || "") : null
  
  if (cacheKey && _pendingRequests.has(cacheKey)) {
    return _pendingRequests.get(cacheKey)
  }

  const requestPromise = (async () => {
    try {
      return await _executeRequest(path, init, attemptRefresh)
    } finally {
      if (cacheKey) _pendingRequests.delete(cacheKey)
    }
  })()

  if (cacheKey) _pendingRequests.set(cacheKey, requestPromise)
  return requestPromise
}

async function _executeRequest(path, init = {}, attemptRefresh = true) {
  let tokens = getTokens()

  // Proactively refresh if access token is expired but refresh token exists
  if (attemptRefresh && tokens?.access && tokens?.refresh && isJwtExpired(tokens.access)) {
    const nextTokens = await refreshAccessToken(tokens)
    if (nextTokens) {
      setTokens(nextTokens)
      tokens = nextTokens
    } else {
      setTokens(null)
      window.dispatchEvent(new CustomEvent("quicktims:session-expired"))
      throw { status: 401, body: { detail: "Session expired. Please log in again." } }
    }
  }

  const headers = new Headers(init.headers ?? {})
  if (!headers.has("Content-Type") && init.json !== undefined) headers.set("Content-Type", "application/json")
  if (tokens?.access) headers.set("Authorization", `Bearer ${tokens.access}`)

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body
    })

    if (res.status === 401 && attemptRefresh && tokens?.refresh && tokens.access && isJwtExpired(tokens.access)) {
      const nextTokens = await refreshAccessToken(tokens)
      if (nextTokens) {
        setTokens(nextTokens)
        return apiRequest(path, init, false)
      }
      setTokens(null)
      window.dispatchEvent(new CustomEvent("quicktims:session-expired"))
    }

    // Also handle 401 when no refresh token exists at all
    if (res.status === 401 && !tokens?.access) {
      window.dispatchEvent(new CustomEvent("quicktims:session-expired"))
    }

    if (!res.ok) {
      const err = { status: res.status, body: await safeJson(res) }
      throw err
    }

    _offline = false
    return safeJson(res)

  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err
    }
    _offline = true
    throw err
  }
}

export function unwrapResults(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && Array.isArray(value.results)) return value.results
  return []
}
