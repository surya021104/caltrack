/**
 * useWebSocket — reconnecting WebSocket hook with JWT auth.
 *
 * Usage:
 *   const { send, readyState } = useWebSocket("/ws/live/admin/", {
 *     onMessage: (data) => dispatch(applyEmployeePing(data)),
 *     onConnect: () => console.log("connected"),
 *   })
 *
 * The hook:
 *   • Appends ?token=<access_token> automatically
 *   • Reconnects with exponential back-off (1 s → 30 s max)
 *   • Stops reconnecting on auth failure codes (4001, 4003)
 *   • Exposes send(), readyState (WebSocket.OPEN / CONNECTING / CLOSED)
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { getTokens } from "../state/auth/tokens.js"

const WS_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_WS_BASE_URL) ||
  "ws://localhost:8000"

const FATAL_CODES = new Set([4001, 4002, 4003, 4004])

export function useWebSocket(path, { onMessage, onConnect, onDisconnect } = {}) {
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const attemptsRef = useRef(0)
  const mountedRef = useRef(true)
  const callbacksRef = useRef({ onMessage, onConnect, onDisconnect })

  // Keep callbacks fresh without triggering re-connects
  useEffect(() => {
    callbacksRef.current = { onMessage, onConnect, onDisconnect }
  })

  const [readyState, setReadyState] = useState(WebSocket.CONNECTING)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const tokens = getTokens()
    if (!tokens?.access) {
      setReadyState(WebSocket.CLOSED)
      return
    }

    const url = `${WS_BASE}${path}?token=${encodeURIComponent(tokens.access)}`
    const ws = new WebSocket(url)
    wsRef.current = ws
    setReadyState(WebSocket.CONNECTING)

    ws.onopen = () => {
      attemptsRef.current = 0
      setReadyState(WebSocket.OPEN)
      callbacksRef.current.onConnect?.()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        callbacksRef.current.onMessage?.(data)
      } catch {
        /* ignore malformed frames */
      }
    }

    ws.onclose = (event) => {
      setReadyState(WebSocket.CLOSED)
      callbacksRef.current.onDisconnect?.(event)

      // Don't reconnect on auth/permission failures
      if (!mountedRef.current || FATAL_CODES.has(event.code)) return

      const delay = Math.min(1000 * 2 ** attemptsRef.current, 30_000)
      attemptsRef.current += 1
      reconnectRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      /* handled by onclose */
    }
  }, [path]) // only path is a dep — callbacks are via ref

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on intentional close
        wsRef.current.close(1000, "component unmounted")
      }
    }
  }, [connect])

  const send = useCallback((data) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(typeof data === "string" ? data : JSON.stringify(data))
    }
  }, [])

  return { send, readyState }
}
