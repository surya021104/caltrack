import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react"
import { createPortal } from "react-dom"
import { useSearchParams } from "react-router-dom"

import { apiRequest, unwrapResults, API_BASE_URL } from "../../api/client.js"
import { getTokens } from "../../state/auth/tokens.js"
import { getAddress } from "../../api/geocoding.js"
import { formatDateTime, Card, Button, Pill, Input, Select, TextArea } from "../components/kit.jsx"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { verifyFaces, loadFaceModels, hasFace } from "../../utils/faceVerify.js"
import { NotificationService } from "../../utils/notifications.js"

import {
  Camera,
  MapPin,
  CheckCircle2,
  Clock,
  Play,
  Square,
  Coffee,
  Loader2,
  Paperclip,
  Check,
  RotateCcw,
  Edit3,
  ChevronUp,
  AlertCircle,
  TrendingUp,
  CheckSquare,
  SlidersHorizontal,
  Calendar,
  Timer,
  Wifi,
  WifiOff,
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  Search,
  Filter,
  ChevronDown,
  BarChart2,
  Clock3,
  FileText,
  Download,
  Trash2,
  LogOut,
  MoreHorizontal,
  ChevronRight,
  Upload
} from "lucide-react"

const AuditLedger = lazy(() => import("./AuditLedger.jsx"))

// ─── GPS helpers ──────────────────────────────────────────────
const DAILY_TARGET_HRS = 8
const GPS_TIMEOUT_MS = 25000
const TARGET_ACCURACY_M = 30

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

function findOpenLog(logs) { return logs.find((l) => !l.clock_out) ?? null }
function findOpenBreak(log) {
  if (!log?.breaks) return null
  return log.breaks.find((b) => !b.break_end) ?? null
}

async function downloadLogPdf(id) {
  try {
    const tokens = getTokens()
    const token = tokens?.access
    if (!token) throw new Error("No authentication")

    // Use absolute URL from API_BASE_URL
    const res = await fetch(`${API_BASE_URL}/time/logs/${id}/download_pdf/`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Shift_Summary_#${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (err) {
    console.error("PDF download failed", err);
    alert("Failed to download PDF summary report.");
  }
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "--:--:--"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":")
}

function formatHrMin(seconds) {
  if (!seconds) return "0h 0m"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function getPosition(onProgress) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not supported.")); return }
    let watchId = null, best = null
    const cleanup = () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId) }
    const timer = setTimeout(() => { cleanup(); best ? resolve(best) : reject(new Error("GPS timed out.")) }, GPS_TIMEOUT_MS)
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }
        if (onProgress) onProgress(fix.accuracy)
        if (!best || fix.accuracy < best.accuracy) best = fix
        if (fix.accuracy <= TARGET_ACCURACY_M) { clearTimeout(timer); cleanup(); resolve(fix) }
      },
      (err) => { clearTimeout(timer); cleanup(); best ? resolve(best) : reject(err) },
      { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_TIMEOUT_MS }
    )
  })
}

// ─── Hooks ─────────────────────────────────────────────────────
function useLiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

function useElapsed(clockInStr) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!clockInStr) { setElapsed(0); return }
    const start = new Date(clockInStr).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [clockInStr])
  return elapsed
}

function useBreakTimer(openBreak) {
  const [breakElapsed, setBreakElapsed] = useState(0)
  useEffect(() => {
    if (!openBreak?.break_start) { setBreakElapsed(0); return }
    const start = new Date(openBreak.break_start).getTime()
    const tick = () => setBreakElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [openBreak?.break_start])
  return breakElapsed
}

function useLocationTracker(isClockedIn) {
  const isFetching = useRef(false)
  const lastPos = useRef(null)

  useEffect(() => {
    if (!isClockedIn) return;

    const reportLocation = async () => {
      if (isFetching.current) return
      isFetching.current = true
      try {
        const pos = await getPosition()
        if (pos) {
          // Only update if location changed significantly (> 10m) or it's first time
          const dist = lastPos.current ? calculateDistance(pos.lat, pos.lon, lastPos.current.lat, lastPos.current.lon) : 999

          if (dist > 10) {
            await apiRequest("/live-locations/update/", {
              method: "POST",
              json: { lat: pos.lat, lng: pos.lon }
            })
            lastPos.current = pos
          }
        }
      } catch (err) {
        console.debug("[LiveTracking] Report failed:", err)
      } finally {
        isFetching.current = false
      }
    }

    reportLocation()
    // Every 5 minutes (reduced frequency to save DB connections and battery)
    const id = setInterval(reportLocation, 300000)
    return () => clearInterval(id)
  }, [isClockedIn])
}

/**
 * useWsLocationTracker — WebSocket-based GPS tracking (Layer 4).
 *
 * Sends location_ping every 30 s via WebSocket when clocked in.
 * Falls back to REST if WebSocket is not open.
 * Returns { sendSOS } so the SOS button can push alerts.
 */
function useWsLocationTracker(isClockedIn) {
  const wsRef = useRef(null)
  const pingRef = useRef(null)
  const reconnectRef = useRef(null)
  const mountedRef = useRef(true)

  const sendGpsPing = useCallback(() => {
    if (!isClockedIn) return
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const payload = {
          type: "location_ping",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(payload))
        } else {
          // REST fallback
          apiRequest("/live-locations/update/", {
            method: "POST",
            json: { lat: payload.lat, lng: payload.lng },
          }).catch(() => { })
        }
      },
      () => { },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [isClockedIn])

  useEffect(() => {
    mountedRef.current = true
    if (!isClockedIn) return

    const connect = () => {
      if (!mountedRef.current) return
      const tokens = getTokens()
      if (!tokens?.access) return

      const WS_BASE =
        (typeof import.meta !== "undefined" && import.meta.env?.VITE_WS_BASE_URL) ||
        "ws://localhost:8000"
      const ws = new WebSocket(`${WS_BASE}/ws/live/employee/?token=${encodeURIComponent(tokens.access)}`)
      wsRef.current = ws

      ws.onopen = () => sendGpsPing()
      ws.onclose = (e) => {
        if (mountedRef.current && ![4001, 4002, 4003, 4004].includes(e.code)) {
          reconnectRef.current = setTimeout(connect, 5000)
        }
      }
      ws.onerror = () => { }
    }

    connect()
    sendGpsPing()
    pingRef.current = setInterval(sendGpsPing, 30000)

    return () => {
      mountedRef.current = false
      clearInterval(pingRef.current)
      clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close(1000)
      }
    }
  }, [isClockedIn, sendGpsPing])

  const sendSOS = useCallback((lat, lng) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "sos", lat, lng }))
      return true
    }
    return false
  }, [])

  return { sendSOS }
}

// ─── UI Components ──────────────────────────────────────────────
// (Local Card/Pill removed - now using kit.jsx)

function Skeleton({ w = "100%", h = "16px", r = "8px", className = "" }) {
  return (
    <div
      className={`animate-pulse bg-slate-100 ${className}`}
      style={{ width: w, height: h, borderRadius: r }}
    />
  )
}

function StatCard({ icon, label, value, sub, color = "#6366F1", pulse }) {
  const isOT = sub && sub.includes("OT")
  return (
    <Card className={`flex-1 p-6 relative overflow-hidden group transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-black/60 ${isOT ? 'border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10' : 'bg-surface dark:bg-slate-900/60 border-stroke dark:border-slate-800/50'}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg transition-colors ${isOT ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-950 text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
              {React.cloneElement(icon, { size: 16 })}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${isOT ? 'text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
          </div>
          <div className="space-y-1">
            <div className={`text-2xl font-black tracking-tight ${isOT ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{value}</div>
            {sub && (
              <div className={`text-[10px] font-bold ${isOT ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
                {sub}
              </div>
            )}
          </div>
        </div>
        {pulse && (
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </div>
        )}
      </div>

      {/* Decorative background element */}
      <div className={`absolute bottom-[-20%] right-[-10%] w-24 h-24 rounded-full opacity-[0.03] dark:opacity-[0.08] transition-transform duration-500 group-hover:scale-150 ${isOT ? 'bg-red-600' : 'bg-indigo-600'}`}></div>
    </Card>
  )
}

// ─── Selfie Capture Modal ─────────────────────────────────────
export function SelfieCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [captured, setCaptured] = useState(null)
  const [capturedFile, setCapturedFile] = useState(null)
  const [camError, setCamError] = useState("")

  useEffect(() => { startCamera(); return () => stopStream() }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => setReady(true) }
    } catch { setCamError("Camera access denied or unavailable.") }
  }
  function stopStream() { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  function captureFrame() {
    const [video, canvas] = [videoRef.current, canvasRef.current]
    if (!video || !canvas) return
    const size = 400; canvas.width = canvas.height = size
    const ctx = canvas.getContext("2d")
    ctx.save(); ctx.translate(size, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, size, size); ctx.restore()
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    setCaptured(dataUrl); stopStream()
    canvas.toBlob(blob => {
      const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: "image/jpeg" })
      setCapturedFile(file)
    }, "image/jpeg", 0.92)
  }
  function retake() { setCaptured(null); setCapturedFile(null); setReady(false); startCamera() }
  function submitPhoto() {
    if (capturedFile && captured) onCapture(capturedFile, captured)
  }
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-sheet max-w-[440px] w-full p-8">
        <div className="selfieHeader">
          <button className="selfieClose" onClick={onCancel} type="button">✕</button>
          <div><h2 className="selfieTitle">Verify Identity</h2><div className="selfieSubtitle" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}><Clock size={12} /> {timeStr}, IST</div></div>
        </div>
        <div className="selfieRingWrap">
          <svg className={`selfieRingSvg ${captured ? "ringDone" : ready ? "ringActive" : ""}`} viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="108" className="ringTrack" /><circle cx="120" cy="120" r="108" className="ringFill" />
          </svg>
          <div className="selfieCircle">
            {camError ? <div className="selfieCamError"><Camera size={32} opacity={0.5} /><p>{camError}</p></div>
              : captured ? <img src={captured} alt="selfie" className="selfieImg" />
                : <video ref={videoRef} autoPlay muted playsInline className="selfieVideo" style={{ transform: "scaleX(-1)" }} />}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
        <div className="selfieInstruction">{captured ? "Kindly, smile 😊" : ready ? "Position your face in the circle" : camError ? "Camera unavailable" : "Opening camera…"}</div>
        <div className="selfieWarning"><span className="selfieWarnDot">ℹ</span>Make sure you are in a well-lit place.</div>
        <div className="selfieActions">
          {captured ? (
            <><button className="selfieBtnOutline" onClick={retake} type="button"><RotateCcw size={16} style={{ marginRight: 6 }} /> Retake</button>
              <button className="selfieBtnPrimary" onClick={submitPhoto} type="button"><Check size={16} strokeWidth={3} style={{ marginRight: 6 }} /> Use this photo</button></>
          ) : <button className="selfieBtnPrimary" onClick={captureFrame} disabled={!ready || !!camError} type="button">Capture Selfie</button>}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN VIEW
// ═══════════════════════════════════════════════════════════════
function AdminTimePage() {
  const now = useLiveClock()
  const [logs, setLogs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Filters
  const todayStr = new Date().toLocaleDateString("en-CA")
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA")
  const [filterFrom, setFilterFrom] = useState(weekAgo)
  const [filterTo, setFilterTo] = useState(todayStr)
  const [filterEmp, setFilterEmp] = useState("")   // employee id
  const [searchQ, setSearchQ] = useState("")
  const [sortField, setSortField] = useState("clock_in")
  const [sortDir, setSortDir] = useState("desc")
  const [logsOpen, setLogsOpen] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all") // all | live | done

  // Real-time month selection
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const monthThemes = [
    { nav: "text-blue-600 dark:text-blue-400 shadow-[0_4px_0_#BFDBFE,0_8px_20px_rgba(59,130,246,0.2)] dark:shadow-[0_4px_0_#1E3A8A,0_8px_20px_rgba(0,0,0,0.4)] border-blue-100 dark:border-blue-900/30", calBg: "hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-blue-500/20", calText: "group-hover:text-blue-700 dark:group-hover:text-blue-300", dot: "bg-blue-200 dark:bg-blue-800 group-hover:bg-blue-500", badge: "bg-blue-500" },
    { nav: "text-rose-600 dark:text-rose-400 shadow-[0_4px_0_#FECDD3,0_8px_20px_rgba(225,29,72,0.2)] dark:shadow-[0_4px_0_#881337,0_8px_20px_rgba(0,0,0,0.4)] border-rose-100 dark:border-rose-900/30", calBg: "hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:border-rose-200 dark:hover:border-rose-800 hover:shadow-rose-500/20", calText: "group-hover:text-rose-700 dark:group-hover:text-rose-300", dot: "bg-rose-200 dark:bg-rose-800 group-hover:bg-rose-500", badge: "bg-rose-500" },
    { nav: "text-emerald-600 dark:text-emerald-400 shadow-[0_4px_0_#A7F3D0,0_8px_20px_rgba(16,185,129,0.2)] dark:shadow-[0_4px_0_#064E3B,0_8px_20px_rgba(0,0,0,0.4)] border-emerald-100 dark:border-emerald-900/30", calBg: "hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-emerald-500/20", calText: "group-hover:text-emerald-700 dark:group-hover:text-emerald-300", dot: "bg-emerald-200 dark:bg-emerald-800 group-hover:bg-emerald-500", badge: "bg-emerald-500" },
    { nav: "text-violet-600 dark:text-violet-400 shadow-[0_4px_0_#DDD6FE,0_8px_20px_rgba(139,92,246,0.2)] dark:shadow-[0_4px_0_#4C1D95,0_8px_20px_rgba(0,0,0,0.4)] border-violet-100 dark:border-violet-900/30", calBg: "hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-violet-500/20", calText: "group-hover:text-violet-700 dark:group-hover:text-violet-300", dot: "bg-violet-200 dark:bg-violet-800 group-hover:bg-violet-500", badge: "bg-violet-500" },
    { nav: "text-amber-600 dark:text-amber-400 shadow-[0_4px_0_#FDE68A,0_8px_20px_rgba(245,158,11,0.2)] dark:shadow-[0_4px_0_#78350F,0_8px_20px_rgba(0,0,0,0.4)] border-amber-100 dark:border-amber-900/30", calBg: "hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-200 dark:hover:border-amber-800 hover:shadow-amber-500/20", calText: "group-hover:text-amber-700 dark:group-hover:text-amber-300", dot: "bg-amber-200 dark:bg-amber-800 group-hover:bg-amber-500", badge: "bg-amber-500" },
    { nav: "text-cyan-600 dark:text-cyan-400 shadow-[0_4px_0_#CFFAFE,0_8px_20px_rgba(6,182,212,0.2)] dark:shadow-[0_4px_0_#164E63,0_8px_20px_rgba(0,0,0,0.4)] border-cyan-100 dark:border-cyan-900/30", calBg: "hover:bg-cyan-50 dark:hover:bg-cyan-900/20 hover:border-cyan-200 dark:hover:border-cyan-800 hover:shadow-cyan-500/20", calText: "group-hover:text-cyan-700 dark:group-hover:text-cyan-300", dot: "bg-cyan-200 dark:bg-cyan-800 group-hover:bg-cyan-500", badge: "bg-cyan-500" },
    { nav: "text-red-600 dark:text-red-400 shadow-[0_4px_0_#FECACA,0_8px_20px_rgba(239,68,68,0.2)] dark:shadow-[0_4px_0_#7F1D1D,0_8px_20px_rgba(0,0,0,0.4)] border-red-100 dark:border-red-900/30", calBg: "hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800 hover:shadow-red-500/20", calText: "group-hover:text-red-700 dark:group-hover:text-red-300", dot: "bg-red-200 dark:bg-red-800 group-hover:bg-red-500", badge: "bg-red-500" },
    { nav: "text-orange-600 dark:text-orange-400 shadow-[0_4px_0_#FFEDD5,0_8px_20px_rgba(249,115,22,0.2)] dark:shadow-[0_4px_0_#7C2D12,0_8px_20px_rgba(0,0,0,0.4)] border-orange-100 dark:border-orange-900/30", calBg: "hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-200 dark:hover:border-orange-800 hover:shadow-orange-500/20", calText: "group-hover:text-orange-700 dark:group-hover:text-orange-300", dot: "bg-orange-200 dark:bg-orange-800 group-hover:bg-orange-500", badge: "bg-orange-500" },
    { nav: "text-teal-600 dark:text-teal-400 shadow-[0_4px_0_#CCFBF1,0_8px_20px_rgba(20,184,166,0.2)] dark:shadow-[0_4px_0_#134E4A,0_8px_20px_rgba(0,0,0,0.4)] border-teal-100 dark:border-teal-900/30", calBg: "hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-200 dark:hover:border-teal-800 hover:shadow-teal-500/20", calText: "group-hover:text-teal-700 dark:group-hover:text-teal-300", dot: "bg-teal-200 dark:bg-teal-800 group-hover:bg-teal-500", badge: "bg-teal-500" },
    { nav: "text-fuchsia-600 dark:text-fuchsia-400 shadow-[0_4px_0_#F5D0FE,0_8px_20px_rgba(217,70,239,0.2)] dark:shadow-[0_4px_0_#701A75,0_8px_20px_rgba(0,0,0,0.4)] border-fuchsia-100 dark:border-fuchsia-900/30", calBg: "hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 hover:border-fuchsia-200 dark:hover:border-fuchsia-800 hover:shadow-fuchsia-500/20", calText: "group-hover:text-fuchsia-700 dark:group-hover:text-fuchsia-300", dot: "bg-fuchsia-200 dark:bg-fuchsia-800 group-hover:bg-fuchsia-500", badge: "bg-fuchsia-500" },
    { nav: "text-yellow-600 dark:text-yellow-400 shadow-[0_4px_0_#FEF08A,0_8px_20px_rgba(234,179,8,0.2)] dark:shadow-[0_4px_0_#715805,0_8px_20px_rgba(0,0,0,0.4)] border-yellow-100 dark:border-yellow-900/30", calBg: "hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:border-yellow-200 dark:hover:border-yellow-800 hover:shadow-yellow-500/20", calText: "group-hover:text-yellow-700 dark:group-hover:text-yellow-300", dot: "bg-yellow-200 dark:bg-yellow-800 group-hover:bg-yellow-500", badge: "bg-yellow-500" },
    { nav: "text-indigo-600 dark:text-indigo-400 shadow-[0_4px_0_#C7D2FE,0_8px_20px_rgba(79,70,229,0.2)] dark:shadow-[0_4px_0_#312E81,0_8px_20px_rgba(0,0,0,0.4)] border-indigo-100 dark:border-indigo-900/30", calBg: "hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-indigo-500/20", calText: "group-hover:text-indigo-700 dark:group-hover:text-indigo-300", dot: "bg-indigo-200 dark:bg-indigo-800 group-hover:bg-indigo-500", badge: "bg-indigo-500" },
  ]

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams()
      if (filterFrom) params.set("date_from", filterFrom)
      if (filterTo) params.set("date_to", filterTo)
      const [logsRes, empRes] = await Promise.allSettled([
        apiRequest(`/time/logs/?${params}`),
        apiRequest("/employees/"),
      ])
      if (logsRes.status === "fulfilled") setLogs(unwrapResults(logsRes.value))
      if (empRes.status === "fulfilled") setEmployees(unwrapResults(empRes.value))
    } catch (e) { setError("Failed to load data.") }
    finally { setLoading(false) }
  }, [filterFrom, filterTo])

  useEffect(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1).toLocaleDateString("en-CA")
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).toLocaleDateString("en-CA")
    setFilterFrom(firstDay)
    setFilterTo(lastDay)
  }, [selectedMonth, selectedYear])

  useEffect(() => { load() }, [load])

  // ── Real KPI Calculations ──
  const monthStats = useMemo(() => {
    const uniqueDays = new Set(logs.map(l => l.work_date)).size
    const attendanceEntries = logs.length
    const totalWorkingDays = employees.length > 0 ? employees.length * 22 : 0 // hypothetical target

    // Days in current selected month
    const totalDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()

    // Count weekdays (Mon-Fri) in the month
    let workDaysCount = 0
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const day = new Date(selectedYear, selectedMonth, d).getDay()
      if (day !== 0 && day !== 6) workDaysCount++
    }

    const expectedAttendance = workDaysCount * employees.length
    const actualAttendance = logs.filter(l => !!l.clock_in).length
    const attendancePct = expectedAttendance > 0 ? ((actualAttendance / expectedAttendance) * 100).toFixed(1) : "0.0"

    return {
      totalDays: attendanceEntries,
      totalAttendance: new Set(logs.map(l => l.employee)).size,
      totalWorkingDays: expectedAttendance,
      attendancePct,
      daysInMonth: totalDaysInMonth,
      workDaysInMonth: workDaysCount
    }
  }, [logs, employees, selectedMonth, selectedYear])

  // ── Derived stats ──
  const todayLogs = useMemo(() => logs.filter(l => l.work_date === todayStr), [logs, todayStr])
  const liveNow = useMemo(() => todayLogs.filter(l => !l.clock_out), [todayLogs])
  const totalHrs = useMemo(() => logs.reduce((s, l) => s + (l.worked_seconds || 0), 0), [logs])
  const avgHrs = useMemo(() => {
    const uniqueEmps = new Set(logs.map(l => l.employee)).size
    return uniqueEmps > 0 ? Math.round(totalHrs / uniqueEmps) : 0
  }, [logs, totalHrs])

  // Per-employee summary for the "who's in" cards
  const empStatus = useMemo(() => {
    const map = {}
    employees.forEach(e => {
      const name = [e.user?.first_name, e.user?.last_name].filter(Boolean).join(" ") || e.user?.username
      map[e.id] = { id: e.id, name, username: e.user?.username, avatarLetter: (name || "?").charAt(0).toUpperCase(), log: null }
    })
    liveNow.forEach(l => { if (map[l.employee]) map[l.employee].log = l })
    return Object.values(map)
  }, [employees, liveNow])

  // ── Filtered + sorted logs ──
  const filteredLogs = useMemo(() => {
    let arr = [...logs]
    if (filterEmp) arr = arr.filter(l => l.employee === filterEmp)
    if (statusFilter === "live") arr = arr.filter(l => !l.clock_out)
    if (statusFilter === "submitted") arr = arr.filter(l => l.status === "submitted")
    if (statusFilter === "done") arr = arr.filter(l => !!l.clock_out)
    if (searchQ) {
      const q = searchQ.toLowerCase()
      arr = arr.filter(l =>
        (l.employee_name || "").toLowerCase().includes(q) ||
        (l.employee_username || "").toLowerCase().includes(q) ||
        (l.work_date || "").includes(q)
      )
    }
    arr.sort((a, b) => {
      let va = a[sortField], vb = b[sortField]
      if (sortField === "clock_in" || sortField === "clock_out") {
        va = va ? new Date(va).getTime() : 0
        vb = vb ? new Date(vb).getTime() : 0
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1
      if (va > vb) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [logs, filterEmp, statusFilter, searchQ, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("desc") }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full bg-bg dark:bg-bg overflow-hidden">
      {/* ── HEADER ── */}
      <div className="h-24 bg-surface dark:bg-slate-900/50 border-b border-stroke dark:border-slate-800 px-10 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight font-[Manrope]">Attendance Intelligence</h1>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse" />
              <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Enterprise Administrative Ledger</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <Users size={18} className="text-slate-400 dark:text-slate-500" />
            <span className="text-[13px] font-black text-slate-700 dark:text-slate-300 tracking-tight">{employees.length} Personnel Managed</span>
          </div>
          <button
            onClick={load}
            className="w-12 h-12 bg-surface dark:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-2xl border border-stroke dark:border-slate-700 shadow-sm transition-all flex items-center justify-center group"
          >
            <RefreshCw size={20} className={`${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10">
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {/* ── Attendance Dashboard Container ── */}
        <div className="flex flex-col xl:flex-row gap-8">
          {/* Left Panel: Insights & Roster */}
          <div className="w-full xl:w-[340px] shrink-0 space-y-8">
            <div className="p-8 bg-yellow-400 dark:bg-yellow-500/90 text-yellow-950 dark:text-yellow-50 rounded-[2.5rem] shadow-[0_20px_50px_-12px_rgba(250,204,21,0.4)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group border border-yellow-300/50 dark:border-yellow-400/20">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/30 dark:bg-white/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-110 transition-transform duration-700" />
              <div className="relative z-10">
                <div className="text-[11px] font-black text-yellow-900/60 dark:text-yellow-100/60 uppercase tracking-widest mb-2">Monthly Compliance</div>
                <div className="text-5xl font-black tracking-tight">{monthStats.attendancePct}%</div>
                <div className="mt-4 text-[13px] font-bold text-yellow-900/80 dark:text-yellow-100/80">{monthNames[selectedMonth]} Operational Efficiency</div>
                <div className="mt-8 h-2.5 w-full bg-yellow-500/30 dark:bg-yellow-900/30 rounded-full overflow-hidden border border-yellow-600/10">
                  <div className="h-full bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.5)] transition-all duration-1000" style={{ width: `${monthStats.attendancePct}%` }}></div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">Personnel Directory</h2>
                <div className="px-2.5 py-1 bg-slate-100 dark:bg-slate-900 rounded-lg text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{employees.length} Members</div>
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar scrollbar-hide">
                {empStatus.map(e => {
                  const empLogs = logs.filter(l => l.employee === e.id)
                  const presentCount = empLogs.filter(l => !!l.clock_in).length
                  const pct = monthStats.workDaysInMonth > 0 ? Math.round((presentCount / monthStats.workDaysInMonth) * 100) : 0

                  return (
                    <div key={e.id} className="group p-5 bg-surface dark:bg-slate-900/60 rounded-[2rem] border border-stroke dark:border-slate-800/80 hover:border-indigo-100 dark:hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-50/50 dark:hover:shadow-black/60 hover:-translate-y-1 transition-all cursor-pointer">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800/50 flex items-center justify-center font-black text-slate-400 dark:text-slate-600 text-sm group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:border-indigo-100 dark:group-hover:border-indigo-800 transition-all shadow-sm">
                            {e.avatarLetter}
                          </div>
                          {e.log && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-surface dark:border-slate-900 bg-emerald-500 animate-pulse shadow-sm"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-black text-slate-900 dark:text-white truncate tracking-tight">{e.name}</div>
                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">@{e.username}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-black text-slate-900 dark:text-white leading-none">{pct}%</div>
                          <div className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase mt-1">Score</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 rounded-xl text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight text-center">Duty: {presentCount}</div>
                        <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight text-center ${pct > 80 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}`}>
                          {pct > 80 ? 'Optimal' : 'Standard'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 space-y-8">
            {/* Month Navigation */}
            <div className="bg-slate-50 dark:bg-slate-950/40 p-3 rounded-[2.5rem] flex items-center gap-2 overflow-x-auto scrollbar-hide border border-slate-200/60 dark:border-slate-800/80 shadow-inner">
              {monthNames.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(idx)}
                  className={`px-8 py-3.5 rounded-2xl text-[11px] font-black transition-all duration-200 uppercase tracking-widest shrink-0 border ${selectedMonth === idx
                    ? `bg-surface dark:bg-slate-800 -translate-y-1 ${monthThemes[idx].nav}`
                    : 'bg-transparent text-slate-400 dark:text-slate-600 border-transparent hover:bg-surface dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 hover:shadow-[0_4px_0_#E2E8F0,0_6px_15px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_4px_0_#1E293B,0_6px_15px_rgba(0,0,0,0.4)] hover:-translate-y-1 hover:border-slate-100 dark:hover:border-slate-700 active:shadow-none active:translate-y-0'
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Calendar & KPIs Row */}
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Calendar Grid — The Temporal Matrix */}
              <div className="flex-1 p-8 bg-surface dark:bg-slate-900/60 border border-stroke dark:border-slate-800/80 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] dark:shadow-none rounded-[2.5rem]">
                <div className="grid gap-2" style={{ gridTemplateColumns: "50px repeat(7, 1fr)" }}>
                  {/* Header */}
                  <div className="py-4 text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest text-center opacity-60">WEEK</div>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                    <div key={day} className="py-4 text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest text-center">{day}</div>
                  ))}

                  {/* Dynamic Weeks */}
                  {(() => {
                    const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1).getDay()
                    const days = []
                    for (let i = 0; i < firstDayOfMonth; i++) days.push(null)
                    for (let i = 1; i <= monthStats.daysInMonth; i++) days.push(i)
                    const weeks = []
                    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

                    return weeks.map((week, wIdx) => (
                      <React.Fragment key={`w-${wIdx}`}>
                        <div className="flex items-center justify-center text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest bg-slate-50/50 dark:bg-slate-950/30 rounded-2xl">W{wIdx + 1}</div>
                        {week.map((day, dIdx) => {
                          const dateStr = day ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
                          const dayLogs = day ? logs.filter(l => l.work_date === dateStr) : []
                          const isWeekend = dIdx === 0 || dIdx === 6
                          const attendancePct = dayLogs.length > 0 && employees.length > 0 ? Math.round((dayLogs.length / employees.length) * 100) : 0
                          const isToday = day && dateStr === todayStr

                          return (
                            <div key={`d-${wIdx}-${dIdx}`} className={`group flex flex-col items-center justify-center min-h-[90px] rounded-[1.5rem] p-2 relative transition-all duration-300 ${!day ? 'bg-transparent' : isToday ? 'bg-surface dark:bg-slate-800 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_30px_-5px_rgba(0,0,0,0.4)] ring-1 ring-slate-100 dark:ring-slate-700 scale-[1.05] z-20 cursor-pointer' : `bg-slate-50 dark:bg-slate-950/50 border border-transparent hover:scale-105 hover:bg-surface dark:hover:bg-slate-800 z-10 cursor-pointer ${monthThemes[selectedMonth].calBg}`}`}>
                              {day && (
                                <>
                                  {isToday && (
                                    <div className={`absolute top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-[3px] rounded-full text-[7px] font-black text-white uppercase tracking-widest shadow-sm ${monthThemes[selectedMonth].badge}`}>
                                      Today
                                    </div>
                                  )}
                                  <span className={`text-lg font-black tracking-tight transition-colors ${isToday ? 'text-slate-900 dark:text-white' : isWeekend ? 'text-slate-400 dark:text-slate-600' : `text-slate-800 dark:text-slate-300 ${monthThemes[selectedMonth].calText}`}`}>{day}</span>
                                  <div className="mt-1 flex flex-col items-center gap-1.5 min-h-[16px]">
                                    {dayLogs.length > 0 ? (
                                      <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)] transition-colors ${isToday ? monthThemes[selectedMonth].badge : attendancePct > 80 ? 'bg-emerald-500' : attendancePct > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                                    ) : day && !isWeekend && (
                                      <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isToday ? monthThemes[selectedMonth].badge : monthThemes[selectedMonth].dot}`}></div>
                                    )}
                                    {dayLogs.length > 0 && (
                                      <span className={`absolute bottom-2 text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-slate-400 dark:text-slate-500' : `text-slate-400 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity ${monthThemes[selectedMonth].calText}`}`}>
                                        {attendancePct}%
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                        {week.length < 7 && [...Array(7 - week.length)].map((_, i) => <div key={`pad-${i}`} className="min-h-[90px]"></div>)}
                      </React.Fragment>
                    ))
                  })()}
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="w-full lg:w-[320px] flex flex-col gap-4 shrink-0">
                {/* Card 1 */}
                <div className="relative p-6 bg-surface dark:bg-slate-900/60 border border-stroke dark:border-slate-800/80 rounded-[2rem] flex items-center justify-between group hover:bg-surface dark:hover:bg-slate-800 hover:border-indigo-100 dark:hover:border-indigo-500/30 hover:shadow-[0_10px_40px_-10px_rgba(79,70,229,0.15)] dark:hover:shadow-black/60 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500/20 border border-indigo-500/50 group-hover:bg-indigo-500 group-hover:animate-pulse"></div>
                      <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Total Logs</div>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Monthly Captured</div>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{monthStats.totalDays}</div>
                </div>

                {/* Card 2 */}
                <div className="relative p-6 bg-surface dark:bg-slate-900/60 border border-stroke dark:border-slate-800/80 rounded-[2rem] flex items-center justify-between group hover:bg-surface dark:hover:bg-slate-800 hover:border-emerald-100 dark:hover:border-emerald-500/30 hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.15)] dark:hover:shadow-black/60 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/50 group-hover:bg-emerald-500 group-hover:animate-pulse"></div>
                      <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Active Roster</div>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Unique Personnel</div>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{monthStats.totalAttendance}</div>
                </div>

                {/* Card 3 */}
                <div className="relative p-6 bg-surface dark:bg-slate-900/60 border border-stroke dark:border-slate-800/80 rounded-[2rem] flex items-center justify-between group hover:bg-surface dark:hover:bg-slate-800 hover:border-amber-100 dark:hover:border-amber-500/30 hover:shadow-[0_10px_40px_-10px_rgba(245,158,11,0.15)] dark:hover:shadow-black/40 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500/20 border border-amber-500/50 group-hover:bg-amber-500 group-hover:animate-pulse"></div>
                      <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">System Target</div>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Expected Records</div>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{monthStats.totalWorkingDays}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── DETAILED LOGS SECTION ── */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-2 h-10 bg-indigo-600 rounded-full shadow-[0_0_15px_rgba(79,70,229,0.4)]"></div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight font-[Manrope]">Audit Ledger</h2>
                <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">{filteredLogs.length} Records synchronized</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setLogsOpen(!logsOpen)}
                className={`p-2 rounded-xl border transition-all ${logsOpen ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100' : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}
              >
                <Filter size={18} />
              </button>
            </div>
          </div>

          {logsOpen && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
              {/* Table Filters */}
              <div className="flex flex-col xl:flex-row items-center justify-between gap-4 p-3 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 rounded-3xl">

                {/* Search Bar */}
                <div className="flex items-center gap-3 bg-surface dark:bg-slate-900 rounded-2xl px-5 py-3 border border-stroke dark:border-slate-800 shadow-sm w-full xl:w-auto xl:flex-1 xl:max-w-md focus-within:border-indigo-300 dark:focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                  <Search size={18} className="text-indigo-400" />
                  <input
                    type="text"
                    placeholder="Search personnel by name or ID..."
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    className="bg-transparent border-none text-[13px] font-bold text-slate-700 dark:text-slate-300 outline-none w-full placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  />
                </div>

                <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
                  {/* Status Filter Segmented Control */}
                  <div className="flex items-center bg-surface dark:bg-slate-900 border border-stroke dark:border-slate-800 rounded-2xl p-1 shadow-sm w-full md:w-auto overflow-x-auto scrollbar-hide">
                    {["all", "live", "submitted", "done"].map(status => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${statusFilter === status ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        {status === "all" ? "All" : status === "live" ? "Active" : status === "submitted" ? "Review" : "Completed"}
                      </button>
                    ))}
                  </div>

                  {/* Date Range Filter */}
                  <div className="flex items-center gap-2 bg-surface dark:bg-slate-900 border border-stroke dark:border-slate-800 rounded-2xl p-1.5 shadow-sm w-full md:w-auto">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 group hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors cursor-text">
                      <Calendar size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-indigo-500" />
                      <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="bg-transparent text-[11px] font-black text-slate-700 dark:text-slate-300 outline-none cursor-pointer dark:[color-scheme:dark]" />
                    </div>
                    <ChevronRight size={14} className="text-slate-300 dark:text-slate-700" />
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 group hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors cursor-text">
                      <Calendar size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-indigo-500" />
                      <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="bg-transparent text-[11px] font-black text-slate-700 dark:text-slate-300 outline-none cursor-pointer dark:[color-scheme:dark]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-hidden rounded-3xl border border-stroke dark:border-slate-800/80 bg-surface dark:bg-slate-900/60 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800">
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500">Employee</th>
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500">Shift Date</th>
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500">Timeline</th>
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500">Photos</th>
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500">Verification</th>
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500 text-right">Duration</th>
                        <th className="p-6 professional-subtitle text-slate-400 dark:text-slate-500 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                      {filteredLogs.map(l => (
                        <AdminLogRow key={l.id} log={l} onAction={load} />
                      ))}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-20 text-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400 dark:text-slate-600">
                              <FileText size={48} className="opacity-10" />
                              <div className="font-bold">No attendance records found</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Admin table row with live elapsed ────────────────────────
function AdminLogRow({ log, onAction }) {
  const elapsed = useElapsed(log.clock_out ? null : log.clock_in)
  const completedBreaks = (log.breaks || []).filter(b => b.break_end)
  const isLive = !log.clock_out
  const [busy, setBusy] = useState(false)

  async function handleApprove(action, notes = "") {
    setBusy(true)
    try {
      await apiRequest(`/time/logs/${log.id}/approve/`, {
        method: "POST",
        json: { action, admin_notes: notes }
      })
      onAction()
    } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  const workedSeconds = isLive ? elapsed : log.worked_seconds

  return (
    <tr className={`group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${isLive ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
      <td className="p-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${isLive ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
            {(log.employee_name || "?").charAt(0)}
          </div>
          <div>
            <div className="text-sm font-black text-slate-900 dark:text-white">{log.employee_name}</div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">@{log.employee_username}</div>
          </div>
        </div>
      </td>
      <td className="p-6">
        <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{log.work_date}</div>
      </td>
      <td className="p-6">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">In</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatDateTime(log.clock_in).split(",")[1]}</span>
            </div>
            {log.clock_out && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Out</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatDateTime(log.clock_out).split(",")[1]}</span>
              </div>
            )}
          </div>
          {isLive && (
            <div className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full animate-pulse">LIVE</div>
          )}
        </div>
      </td>
      <td className="p-6">
        <div className="flex items-center gap-2">
          {log.clock_in_photo && (
            <a href={log.clock_in_photo} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm hover:scale-110 transition-transform">
              <img src={log.clock_in_photo} className="w-full h-full object-cover" />
            </a>
          )}
          {log.clock_out_photo && (
            <a href={log.clock_out_photo} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm hover:scale-110 transition-transform">
              <img src={log.clock_out_photo} className="w-full h-full object-cover" />
            </a>
          )}
          {!log.clock_in_photo && !log.clock_out_photo && <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600">N/A</span>}
        </div>
      </td>
      <td className="p-6">
        <div className="flex flex-col gap-2">
          <Pill variant={log.status === 'approved' ? 'success' : log.status === 'rejected' ? 'danger' : log.status === 'submitted' ? 'warning' : 'neutral'}>
            {log.status === 'submitted' ? 'In Review' : (log.status || (isLive ? 'Live' : 'Draft'))}
          </Pill>
          {log.face_match_status && log.face_match_status !== 'skipped' && (
            <div className={`flex items-center gap-1 text-[9px] font-black uppercase ${log.face_match_status === 'matched' ? 'text-emerald-500' : 'text-red-500'}`}>
              {log.face_match_status === 'matched' ? <Check size={10} /> : <AlertCircle size={10} />}
              {log.face_match_status === 'matched' ? 'Verified' : 'Mismatch'}
            </div>
          )}
        </div>
      </td>
      <td className="p-6 text-right">
        <div className={`text-sm font-black ${workedSeconds > 8 * 3600 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
          {formatDuration(workedSeconds)}
        </div>
        {workedSeconds > 8 * 3600 && (
          <div className="text-[9px] font-black text-red-400 uppercase">OT +{formatDuration(workedSeconds - 8 * 3600)}</div>
        )}
      </td>
      <td className="p-6 text-right">
        <div className="flex items-center justify-end gap-2">
          {log.status === 'submitted' ? (
            <>
              <button disabled={busy} onClick={() => handleApprove("approve")} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-black rounded-lg shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all">APPROVE</button>
              <button disabled={busy} onClick={() => {
                const reason = window.prompt("Rejection reason?");
                if (reason !== null) handleApprove("reject", reason);
              }} className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-black rounded-lg shadow-lg shadow-red-100 hover:bg-red-600 transition-all">REJECT</button>
            </>
          ) : (
            <>
              {isLive && (
                <button
                  disabled={busy}
                  onClick={() => { if (window.confirm("Force clock out?")) handleApprove("force_clock_out") }}
                  className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                  title="Force Clock Out"
                >
                  <LogOut size={16} />
                </button>
              )}
              {log.clock_out && (
                <button
                  onClick={() => downloadLogPdf(log.id)}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                  title="Download Summary"
                >
                  <FileText size={16} />
                </button>
              )}
            </>
          )}

          <button
            disabled={busy}
            onClick={() => { if (window.confirm("Permanently delete?")) handleApprove("delete") }}
            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Delete Record"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ═══════════════════════════════════════════════════════════════
//  EMPLOYEE VIEW (same as before)
// ═══════════════════════════════════════════════════════════════
function EmployeeTimePage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const urlTaskId = searchParams.get("task_id") || ""

  const displayName = user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
    : "Employee"

  const [logs, setLogs] = useState([])
  const [assignedTasks, setAssignedTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState(urlTaskId)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [logsOpen, setLogsOpen] = useState(true)
  const [gpsStatus, setGpsStatus] = useState("locating")

  const todayStr = new Date().toLocaleDateString("en-CA")
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA")
  const [filterFrom, setFilterFrom] = useState(weekAgo)
  const [filterTo, setFilterTo] = useState(todayStr)

  const [resolvedAddr, setResolvedAddr] = useState("")
  const [currentGPS, setCurrentGPS] = useState(null)
  const [gpsAccuracy, setGpsAccuracy] = useState(null)

  const [sessionNotes, setSessionNotes] = useState("")
  const [sessionPhoto, setSessionPhoto] = useState(null)
  const [selfieFile, setSelfieFile] = useState(null)
  const [selfiePreview, setSelfiePreview] = useState(null)
  const [showSelfie, setShowSelfie] = useState(false)

  // Job Site Photos
  const [jobPhotoFile, setJobPhotoFile] = useState(null)
  const [jobPhotoPreview, setJobPhotoPreview] = useState(null)
  const [jobPhotoType, setJobPhotoType] = useState("progress")
  const [jobPhotoCaption, setJobPhotoCaption] = useState("")
  const [showJobPhotoCamera, setShowJobPhotoCamera] = useState(false)

  const [geofenceStatus, setGeofenceStatus] = useState(null)
  const [breakType, setBreakType] = useState("lunch")
  const [faceVerifyStatus, setFaceVerifyStatus] = useState(null) // null | 'verifying' | 'matched' | 'mismatch' | 'no_face'
  const [faceVerifyScore, setFaceVerifyScore] = useState(null)

  // ── Phase 5: dry-run geofence preflight ─────────────────────────────
  // Holds the most recent response from POST /api/time/geofence/validate-point/.
  // Format mirrors the engine's Decision → see geofence_service.py.
  // Shape: { allowed, decision, mode, matched_location, distance_m, radius_m,
  //          candidate_count, geofence_passed, admin_override_used, shift }
  const [preflight, setPreflight] = useState(null)
  const [preflightLoading, setPreflightLoading] = useState(false)

  const now = useLiveClock()
  const openLog = useMemo(() => findOpenLog(logs), [logs])
  const openBreak = useMemo(() => findOpenBreak(openLog), [openLog])
  const elapsed = useElapsed(openLog?.clock_in)
  const breakElapsed = useBreakTimer(openBreak)

  // Layer 4: WS-based GPS tracking + SOS
  const { sendSOS } = useWsLocationTracker(!!openLog)
  const [sosSending, setSosSending] = useState(false)
  const [sosConfirmed, setSosConfirmed] = useState(false)

  const handleSOS = useCallback(async () => {
    if (sosSending || sosConfirmed) return
    if (!window.confirm("Send SOS alert? Your admin will be notified immediately with your location.")) return
    setSosSending(true)
    try {
      const sendWithCoords = async (lat, lng) => {
        const sent = sendSOS(lat, lng)
        if (!sent) {
          await apiRequest("/live-locations/sos/", {
            method: "POST",
            json: lat !== null ? { lat, lng } : {},
          })
        }
        setSosConfirmed(true)
        setTimeout(() => setSosConfirmed(false), 8000)
      }

      navigator.geolocation?.getCurrentPosition(
        (pos) => sendWithCoords(pos.coords.latitude, pos.coords.longitude),
        () => sendWithCoords(null, null),
        { enableHighAccuracy: true, timeout: 6000 }
      )
    } catch (err) {
      console.error("SOS failed:", err)
    } finally {
      setSosSending(false)
    }
  }, [sendSOS, sosSending, sosConfirmed])

  // Legacy REST polling fallback (kept for compatibility)
  useLocationTracker(false)

  // Preload face models when clocked in
  useEffect(() => {
    if (openLog) loadFaceModels()
  }, [openLog])

  const completedBreaks = useMemo(() => (openLog?.breaks || []).filter(b => b.break_end), [openLog])
  const totalBreakSecs = useMemo(() => completedBreaks.reduce((s, b) => s + (b.duration_seconds || 0), 0), [completedBreaks])

  const weekStats = useMemo(() => {
    const total = logs.reduce((s, l) => s + (l.worked_seconds || 0), 0)
    const days = new Set(logs.map(l => l.work_date)).size
    const otSeconds = Math.max(0, total - (40 * 3600))
    return { total, days, otSeconds, avg: days > 0 ? Math.round(total / days) : 0 }
  }, [logs])

  const todayLog = useMemo(() => logs.find(l => l.work_date === todayStr), [logs, todayStr])
  const todaySeconds = useMemo(() => {
    if (!todayLog) return 0
    return todayLog.clock_out ? (todayLog.worked_seconds || 0) : elapsed
  }, [todayLog, elapsed])
  const todayOtSeconds = Math.max(0, todaySeconds - (8 * 3600))
  const todayPct = Math.min(100, Math.round((todaySeconds / (DAILY_TARGET_HRS * 3600)) * 100))

  useEffect(() => {
    async function initGPS() {
      try {
        const pos = await getPosition(acc => { setGpsAccuracy(acc); setGpsStatus("locating") })
        setCurrentGPS(pos); setGpsAccuracy(pos.accuracy); setGpsStatus("ok")
        const addr = await getAddress(pos.lat, pos.lon)
        setResolvedAddr(addr)
      } catch { setGpsStatus("error") }
    }
    initGPS()
  }, [])

  useEffect(() => {
    async function fetchGeofence() {
      try {
        const res = await apiRequest("/time/geofence-status/")
        const data = unwrapResults(res)
        setGeofenceStatus(data)
      } catch (e) {
        console.error("Failed to fetch geofence status", e)
      }
    }
    fetchGeofence()
  }, [])

  const distanceToSite = useMemo(() => {
    if (!currentGPS || !geofenceStatus?.job_site) return null
    return calculateDistance(
      currentGPS.lat, currentGPS.lon,
      geofenceStatus.job_site.lat, geofenceStatus.job_site.lng
    )
  }, [currentGPS, geofenceStatus])

  const geofencePassed = useMemo(() => {
    if (!geofenceStatus?.geofence_enabled) return true
    if (distanceToSite === null) return false
    const radius = geofenceStatus.job_site?.radius_override || geofenceStatus.org_radius || 200
    return distanceToSite <= radius
  }, [distanceToSite, geofenceStatus])

  const geofenceError = useMemo(() => {
    if (openLog) return null // Hide errors if already clocked in
    if (!geofenceStatus?.geofence_enabled) return null
    if (distanceToSite === null) return "Waiting for GPS lock…"
    const radius = geofenceStatus.job_site?.radius_override || geofenceStatus.org_radius || 200
    if (distanceToSite > radius) {
      const distStr = distanceToSite > 1000 ? `${(distanceToSite / 1000).toFixed(1)} km` : `${distanceToSite}m`
      return `You are ${distStr} from job site. Move closer to clock in.`
    }
    return null
  }, [distanceToSite, geofenceStatus, openLog])

  // ── Phase 5: dry-run preflight via POST /api/time/geofence/validate-point/ ─
  // Fires whenever GPS settles, debounced to avoid spamming on jitter.
  // Skipped while clocked in (no preflight needed).
  useEffect(() => {
    if (openLog || !currentGPS) {
      setPreflight(null)
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      if (cancelled) return
      setPreflightLoading(true)
      try {
        const res = await apiRequest("/time/geofence/validate-point/", {
          method: "POST",
          json: { lat: currentGPS.lat, lng: currentGPS.lon },
        })
        if (!cancelled) setPreflight(res)
      } catch (err) {
        if (!cancelled) {
          // 4xx returns the legacy block body; 5xx is a real error. Either
          // way, keep the UI usable — the actual /clock-in/ POST is the
          // real authority.
          setPreflight(err?.body || null)
        }
      } finally {
        if (!cancelled) setPreflightLoading(false)
      }
    }, 800) // debounce: don't fire on every micro-update of GPS
    return () => { cancelled = true; clearTimeout(handle) }
  }, [currentGPS, openLog])

  // Derived pill state — { tone, icon-name, label } for visual rendering.
  const preflightPill = useMemo(() => {
    if (openLog) return null
    if (preflightLoading) return { tone: "neutral", label: "Checking site…" }
    if (!preflight) return null
    const dist = preflight.distance_m
    const distStr = dist == null
      ? ""
      : dist < 1000 ? ` · ${dist}m` : ` · ${(dist / 1000).toFixed(1)}km`

    if (preflight.allowed && preflight.geofence_passed) {
      const name = preflight.matched_location?.name || "your site"
      return { tone: "ok", label: `Inside ${name}${distStr}` }
    }
    if (preflight.allowed && !preflight.geofence_passed) {
      // Warn-only mode: server allowed but flagged. Surface the soft warning.
      return { tone: "warn", label: `Outside geofence (warn-only)${distStr}` }
    }
    if (preflight.decision === "shift_location_mismatch") {
      return { tone: "block", label: `Wrong site for current shift${distStr}` }
    }
    if (preflight.decision === "no_assigned_locations") {
      return { tone: "warn", label: "No site assigned to you" }
    }
    return { tone: "block", label: `Outside geofence${distStr}` }
  }, [preflight, preflightLoading, openLog])

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams()
      if (filterFrom) params.set("date_from", filterFrom)
      if (filterTo) params.set("date_to", filterTo)
      const [logsRes, tasksRes] = await Promise.allSettled([
        apiRequest(`/time/logs/?${params}`),
        apiRequest("/tasks/my/")
      ])
      if (logsRes.status === "fulfilled") setLogs(unwrapResults(logsRes.value))
      if (tasksRes.status === "fulfilled") setAssignedTasks(unwrapResults(tasksRes.value))
    } finally { setLoading(false) }
  }, [filterFrom, filterTo])
  useEffect(() => { load() }, [load])

  async function action(path, overridePhoto = null) {
    setBusy(true); setError("")
    try {
      const fd = new FormData()
      if (path.includes("clock-in") || path.includes("clock-out")) {
        let gps = currentGPS
        try {
          const fresh = await getPosition(acc => setGpsAccuracy(acc))
          gps = fresh; setCurrentGPS(fresh); setGpsAccuracy(fresh.accuracy); setGpsStatus("ok")
          const addr = await getAddress(fresh.lat, fresh.lon)
          if (addr) setResolvedAddr(addr)
        } catch { }
        if (gps) { fd.append("lat", gps.lat); fd.append("lon", gps.lon) }
        if (resolvedAddr) fd.append("address", resolvedAddr)
        if (sessionNotes) fd.append("notes", sessionNotes)
        if (selectedTaskId) fd.append("task_id", selectedTaskId)

        const photoToSend = overridePhoto || selfieFile || sessionPhoto
        if (photoToSend) fd.append("photo", photoToSend)

        // Attach face verification result for clock-out
        if (path.includes("clock-out") && faceVerifyStatus) {
          fd.append("face_match_status", faceVerifyStatus)
          if (faceVerifyScore !== null) fd.append("face_match_score", faceVerifyScore)
        }
      }
      if (path.includes("break/start")) {
        fd.append("break_type", breakType)
      }
      await apiRequest(path, { method: "POST", body: fd })

      // Send Windows Notifications
      if (path.includes("clock-in")) {
        NotificationService.send("Shift Started", "You are now clocked in at " + (resolvedAddr || "current location"))
      } else if (path.includes("clock-out")) {
        NotificationService.send("Shift Ended", "You have successfully clocked out. Have a great day!")
      }

      setSessionNotes(""); setSessionPhoto(null); setSelfieFile(null); setSelfiePreview(null)
      setFaceVerifyStatus(null); setFaceVerifyScore(null); setSelectedTaskId("")
      await load()
    } catch (err) {
      const msg = err?.body?.message || err?.body?.detail || "Action failed. Please try again."
      setError(msg)
    }
    finally { setBusy(false) }
  }

  async function uploadJobPhoto() {
    if (!jobPhotoFile) return
    setBusy(true); setError("")
    try {
      const fd = new FormData()
      fd.append("photo", jobPhotoFile)
      fd.append("photo_type", jobPhotoType)
      fd.append("caption", jobPhotoCaption)
      await apiRequest("/time/photos/upload/", { method: "POST", body: fd })
      setJobPhotoFile(null); setJobPhotoPreview(null); setJobPhotoCaption(""); setJobPhotoType("progress")
      await load()
    } catch (err) {
      setError(err?.body?.message || "Failed to upload photo.")
    } finally { setBusy(false) }
  }

  async function submitLog(id) {
    if (!window.confirm("Submit this timesheet for approval? You won't be able to edit it after submission.")) return;
    setBusy(true);
    try {
      await apiRequest(`/time/logs/${id}/submit/`, { method: "POST" });
      await load();
    } catch (e) { setError(e?.body?.detail || "Failed to submit timesheet."); }
    finally { setBusy(false); }
  }

  // ─── Right panel state ──────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(!!urlTaskId)

  useEffect(() => {
    if (urlTaskId) {
      setSelectedTaskId(urlTaskId)
      setPanelOpen(true)
    }
  }, [urlTaskId])
  const [moodRating, setMoodRating] = useState(null)
  const [showMoodSurvey, setShowMoodSurvey] = useState(false)
  const [moodNote, setMoodNote] = useState("")

  function handleClockOut() {
    setShowMoodSurvey(true)
  }

  function submitMoodAndClockOut() {
    const moodText = moodRating ? `[Mood: ${moodRating}] ` : ""
    const finalNote = moodText + (moodNote || sessionNotes)
    setSessionNotes(finalNote)
    setShowMoodSurvey(false)
    setShowSelfie(true)
  }

  return (
    <>
      {showSelfie && (
        <SelfieCapture
          onCapture={async (file, preview) => {
            if (openLog) {
              // Clock-out: verify face first
              setSelfieFile(file);
              setSelfiePreview(preview);
              setShowSelfie(false);
              setFaceVerifyStatus('verifying');
              setError('');

              // Get clock-in photo URL and ensure it is absolute
              let clockInPhoto = openLog.clock_in_photo;
              if (clockInPhoto && clockInPhoto.startsWith('/')) {
                const host = API_BASE_URL.replace('/api', '');
                clockInPhoto = `${host}${clockInPhoto}`;
              }

              if (clockInPhoto && preview) {
                try {
                  const result = await verifyFaces(clockInPhoto, preview);
                  setFaceVerifyScore(result.score);
                  if (result.status === 'mismatch') {
                    setFaceVerifyStatus('mismatch');
                    setError('⚠️ Identity Verification Anomaly: Your selfie does not match your clock-in photo. Your admin has been notified, but you may proceed to clock out.');
                    // Proceed anyway instead of returning
                  }
                  if (result.status === 'no_face') {
                    setFaceVerifyStatus('no_face');
                    setError('⚠️ No face detected in the photos! You may proceed, but please contact your admin to verify this shift manually.');
                    // Proceed anyway instead of returning
                  }
                  setFaceVerifyStatus('matched');
                } catch (err) {
                  console.error('Face verify error', err);
                  setFaceVerifyStatus(null); // allow clock-out on error
                }
              }
              // Proceed with clock-out
              setTimeout(() => action("/time/clock-out/", file), 100);
            } else {
              // Clock-in photo
              setShowSelfie(false);
              setFaceVerifyStatus('verifying');
              setError('');

              const faceExists = await hasFace(preview);
              if (!faceExists) {
                setFaceVerifyStatus('no_face');
                setError('⚠️ No face detected! Please ensure your face is clearly visible, well-lit, and fully within the frame to successfully clock in.');
                return; // BLOCK clock-in, do not keep the photo
              }

              // Proceed
              setFaceVerifyStatus(null);
              setSelfieFile(file);
              setSelfiePreview(preview);
            }
          }}
          onCancel={() => setShowSelfie(false)}
        />
      )}
      {showJobPhotoCamera && (
        <SelfieCapture
          onCapture={(file, preview) => { setJobPhotoFile(file); setJobPhotoPreview(preview); setShowJobPhotoCamera(false) }}
          onCancel={() => setShowJobPhotoCamera(false)}
        />
      )}

      {/* ═══ MOOD SURVEY OVERLAY ═══ */}
      {showMoodSurvey && createPortal(
        <div className="modal-overlay">
          <div className="modal-sheet max-w-md w-full p-10 text-center">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8 tracking-tight">How was work today?</h2>
            <div className="flex justify-center gap-4 mb-10">
              {[
                { key: 'tough', emoji: '😞', label: 'Tough' },
                { key: 'normal', emoji: '😐', label: 'Normal' },
                { key: 'great', emoji: '😄', label: 'Great' },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setMoodRating(m.key)}
                  className={`flex flex-col items-center gap-3 flex-1 p-4 rounded-2xl border-2 transition-all duration-300 ${moodRating === m.key ? 'border-orange-500 bg-orange-50 scale-105' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                >
                  <span className="text-4xl">{m.emoji}</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${moodRating === m.key ? 'text-orange-600' : 'text-slate-400'}`}>{m.label}</span>
                </button>
              ))}
            </div>

            <div className="text-left space-y-2 mb-8">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Additional Context</label>
              <textarea
                value={moodNote}
                onChange={e => setMoodNote(e.target.value)}
                placeholder="Share your thoughts..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold text-slate-900 focus:border-orange-500 outline-none transition-all"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => { setShowMoodSurvey(false); setMoodRating(null); setMoodNote("") }}
                className="flex-1 py-4 rounded-2xl text-sm font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitMoodAndClockOut}
                className="flex-[2] py-4 rounded-2xl text-sm font-black text-white bg-orange-600 hover:bg-orange-700 shadow-xl shadow-orange-200 transition-all"
              >
                Submit & Finish
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═══ MAIN PAGE ═══ */}
      <div className="flex flex-col h-[calc(100vh-64px)] w-full bg-bg dark:bg-bg overflow-hidden">
        {/* Header Row */}
        <div className="h-20 bg-surface dark:bg-slate-900/50 border-b border-stroke dark:border-slate-800 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100 dark:shadow-none">
              <Clock size={24} className={openLog ? 'animate-pulse' : ''} />
            </div>
            <div>
              <h1 className="text-xl professional-title text-slate-900 dark:text-white">Personal Timesheets</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${openLog ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                <span className="text-[10px] professional-subtitle text-slate-400 dark:text-slate-500">
                  {openLog ? (openLog.task ? `Working on: ${openLog.task.title}` : (openBreak ? 'Currently on Break' : 'On Active Duty')) : 'System Standby'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {openLog && (
              <div className="flex items-center bg-slate-900 dark:bg-slate-800 text-white rounded-2xl px-1.5 py-1.5 shadow-xl shadow-slate-200 dark:shadow-none border border-slate-800 dark:border-slate-700">
                <div className="px-4 py-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none">Session</span>
                  <span className="text-lg font-black tabular-nums">{formatDuration(elapsed)}</span>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {!openBreak ? (
                    <>
                      <button onClick={() => action("/time/break/start/")} className="p-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-amber-500 text-white rounded-xl transition-all" title="Start Break"><Coffee size={16} /></button>
                      <button onClick={() => setPanelOpen(true)} className="p-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-emerald-500 text-white rounded-xl transition-all" title="Job Photo"><Camera size={16} /></button>
                      <button onClick={handleClockOut} className="p-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-red-500 text-white rounded-xl transition-all" title="Clock Out"><Square size={14} fill="currentColor" /></button>
                      <button
                        onClick={handleSOS}
                        disabled={sosSending}
                        title="SOS — Send emergency alert to admin"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 12,
                          background: sosConfirmed ? "#059669" : "#E94560",
                          color: "white",
                          border: "none",
                          fontWeight: 900,
                          fontSize: 10,
                          cursor: "pointer",
                          letterSpacing: "0.06em",
                          opacity: sosSending ? 0.7 : 1,
                          boxShadow: sosConfirmed ? "none" : "0 0 0 3px rgba(233,69,96,0.3)",
                          animation: !sosConfirmed && !sosSending ? "sosPulse 2s infinite" : "none",
                          transition: "all 0.2s",
                        }}
                      >
                        {sosConfirmed ? "✓ SENT" : sosSending ? "…" : "SOS"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => action("/time/break/end/")} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl flex items-center gap-2 transition-all"><Play size={14} /> RESUME</button>
                  )}
                </div>
              </div>
            )}
            {!openLog && (
              <button
                onClick={() => setPanelOpen(true)}
                disabled={busy}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl shadow-xl shadow-indigo-200 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <Clock size={18} /> START SHIFT
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold animate-in shake duration-500">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {/* Verification Banners */}
          <div className="space-y-4">
            {faceVerifyStatus === 'verifying' && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between animate-in fade-in duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                    <Loader2 size={16} className="animate-spin text-indigo-600" />
                  </div>
                  <span className="text-sm font-bold text-indigo-900">Authenticating identity models...</span>
                </div>
              </div>
            )}
            {faceVerifyStatus === 'mismatch' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between animate-in fade-in duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                    <AlertCircle size={16} className="text-red-600" />
                  </div>
                  <span className="text-sm font-bold text-red-900">Identity verification anomaly detected.</span>
                </div>
                <button onClick={() => { setFaceVerifyStatus(null); setError(''); setShowSelfie(true) }} className="px-4 py-1.5 bg-red-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest">Re-verify</button>
              </div>
            )}
            {faceVerifyStatus === 'matched' && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 animate-in fade-in duration-300">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <span className="text-sm font-bold text-emerald-900">Identity verified {faceVerifyScore && `(${faceVerifyScore}%)`}</span>
              </div>
            )}
          </div>

          {/* KPI Dashboard */}
          {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={<TrendingUp />}
                label="Weekly Total"
                value={formatHrMin(weekStats.total)}
                sub={weekStats.otSeconds > 0 ? `+${formatHrMin(weekStats.otSeconds)} OVERTIME` : "Standard Volume"}
                color={weekStats.otSeconds > 0 ? "#EF4444" : "#6366F1"}
              />
              <StatCard
                icon={<Calendar />}
                label="Persistence"
                value={`${weekStats.days} Days`}
                sub="Logged this week"
                color="#10B981"
              />
              <StatCard
                icon={<Timer />}
                label="Daily Intensity"
                value={formatHrMin(weekStats.avg)}
                sub="Average Session Length"
                color="#F59E0B"
              />
              {openLog && (
                <StatCard
                  icon={<Clock />}
                  label="Live Session"
                  value={formatDuration(elapsed)}
                  sub={openLog.task ? `Task: ${openLog.task.title}` : (geofenceStatus?.job_site?.name || "Corporate Site")}
                  color="#EF4444"
                  pulse
                />
              )}
            </div>
          )}

          {/* Audit Ledger Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.4)]"></div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight font-[Manrope]">Personal Ledger</h2>
                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-900 rounded-full text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest border border-slate-200/60 dark:border-slate-800">{logs.length} Entries</span>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/40 p-1 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <button onClick={() => { setFilterFrom(todayStr); setFilterTo(todayStr) }} className="px-4 py-1.5 text-[10px] font-black text-slate-500 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 uppercase tracking-widest">Today</button>
                <button onClick={() => { setFilterFrom(weekAgo); setFilterTo(todayStr) }} className="px-4 py-1.5 bg-white dark:bg-slate-800 shadow-sm dark:shadow-none rounded-lg text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border border-transparent dark:border-slate-700">Week</button>
                <button onClick={() => { const m = new Date(); m.setDate(1); setFilterFrom(m.toLocaleDateString("en-CA")); setFilterTo(todayStr) }} className="px-4 py-1.5 text-[10px] font-black text-slate-500 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 uppercase tracking-widest">Month</button>
              </div>
            </div>

            <Suspense fallback={
              <div className="p-20 flex flex-col items-center gap-4 text-slate-300">
                <Loader2 className="animate-spin" size={40} />
                <div className="font-bold text-xs uppercase tracking-widest">Synchronizing Ledger...</div>
              </div>
            }>
              <AuditLedger
                logs={logs}
                loading={loading}
                elapsed={elapsed}
                downloadLogPdf={downloadLogPdf}
                submitLog={submitLog}
                formatDuration={formatDuration}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ═══ SLIDE-OUT OPERATION PANEL ═══ */}
      {panelOpen && (
        <div className="fixed inset-0 z-[1000] flex justify-end animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />
          <div className="relative w-full max-w-md bg-surface dark:bg-slate-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 border-l border-stroke dark:border-slate-800">
            {/* Header */}
            <div className="p-8 border-b border-stroke dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{openLog ? 'Complete Shift' : 'Initiate Session'}</h3>
                {openLog && <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Started {formatDateTime(openLog.clock_in).split(",")[1]}</div>}
              </div>
              <button onClick={() => setPanelOpen(false)} className="w-10 h-10 rounded-xl bg-bg dark:bg-slate-950 text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all border border-stroke dark:border-slate-800">✕</button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {/* Telemetry Status */}
              <div className="p-5 bg-bg dark:bg-slate-950 rounded-2xl border border-stroke dark:border-slate-800/80 flex items-center gap-4 shadow-inner">
                <div className="w-10 h-10 rounded-xl bg-surface dark:bg-slate-900 flex items-center justify-center shadow-sm border border-stroke dark:border-slate-800">
                  <MapPin size={18} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-300 truncate">{resolvedAddr || "Locating precision coordinates..."}</div>
                  {currentGPS && <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{currentGPS.lat.toFixed(5)}, {currentGPS.lon.toFixed(5)}</div>}
                </div>
                <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${gpsStatus === 'ok' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                  {gpsStatus === 'ok' ? 'LOCKED' : 'LINKING'}
                </div>
              </div>

              {geofenceError && geofenceStatus?.strict_mode && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} /> {geofenceError}
                </div>
              )}

              {/* Task Selection (Clock-in only) */}
              {!openLog && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Select Assigned Task (Optional)</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 transition-colors">
                      <CheckSquare size={18} />
                    </div>
                    <select
                      value={selectedTaskId}
                      onChange={e => setSelectedTaskId(e.target.value)}
                      className="w-full bg-bg dark:bg-slate-950 border border-stroke dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white focus:border-indigo-500 outline-none appearance-none transition-all shadow-sm"
                    >
                      <option value="">— No specific task —</option>
                      {assignedTasks
                        .filter(t => t.status === 'pending' || t.status === 'in_progress')
                        .map(t => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))
                      }
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                  {selectedTaskId && (
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-700 animate-in fade-in slide-in-from-top-1">
                      Target task identified. Session will be linked to this work order.
                    </div>
                  )}
                </div>
              )}

              {/* Identity Verification (Clock-in only) */}
              {!openLog && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Identity Verification</label>
                  <button
                    onClick={() => setShowSelfie(true)}
                    className={`w-full h-40 rounded-3xl border-2 border-dashed transition-all overflow-hidden relative ${selfiePreview ? 'border-indigo-600 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 bg-bg dark:bg-slate-950 shadow-sm'}`}
                  >
                    {selfiePreview ? (
                      <img src={selfiePreview} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Camera size={32} className="text-slate-300 dark:text-slate-700" />
                        <span className="text-xs font-black text-slate-400 dark:text-slate-600">TAP TO CAPTURE SELFIE</span>
                      </div>
                    )}
                  </button>
                  {selfiePreview && (
                    <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase">
                      <Check size={12} strokeWidth={3} /> Verification Locked
                    </div>
                  )}
                </div>
              )}

              {/* Operation Notes */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Operation Notes</label>
                <textarea
                  value={sessionNotes}
                  onChange={e => setSessionNotes(e.target.value)}
                  placeholder={openLog ? "Summary of completed tasks..." : "Briefly describe your objectives..."}
                  className="w-full bg-bg dark:bg-slate-950 border border-stroke dark:border-slate-800 rounded-2xl p-4 text-sm font-bold text-slate-900 dark:text-white focus:border-indigo-500 outline-none transition-all shadow-sm"
                  rows={4}
                />
              </div>

              {/* Job Site Intelligence (Clocked-in only) */}
              {openLog && (
                <div className="p-6 bg-slate-900 rounded-3xl space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera size={16} className="text-indigo-400" />
                      <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Intelligence Report</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {["before", "progress", "after"].map(t => (
                      <button
                        key={t}
                        onClick={() => setJobPhotoType(t)}
                        className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${jobPhotoType === t ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {!jobPhotoPreview ? (
                    <button
                      onClick={() => setShowJobPhotoCamera(true)}
                      className="w-full h-24 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 transition-all"
                    >
                      <Camera size={20} />
                      <span className="text-[9px] font-black uppercase">Capture Photo</span>
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl overflow-hidden relative group">
                          <img src={jobPhotoPreview} className="w-full h-full object-cover" />
                          <button onClick={() => { setJobPhotoFile(null); setJobPhotoPreview(null) }} className="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">✕</button>
                        </div>
                        <input
                          placeholder="Brief caption..."
                          value={jobPhotoCaption}
                          onChange={e => setJobPhotoCaption(e.target.value)}
                          className="flex-1 bg-white/5 border border-slate-700 rounded-xl h-12 px-4 text-xs font-bold text-white outline-none"
                        />
                      </div>
                      <button
                        onClick={uploadJobPhoto}
                        disabled={busy}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {busy ? 'REPORTING...' : 'UPLOAD INTEL'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Break Management System */}
              {openLog && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Coffee size={14} className="text-amber-500" /> Break Management System
                    </label>
                    {openBreak && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-lg animate-pulse uppercase">
                        Active Session
                      </span>
                    )}
                  </div>

                  {!openBreak ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        {["tea", "lunch", "personal"].map(t => (
                          <button
                            key={t}
                            disabled={busy}
                            onClick={() => setBreakType(t)}
                            className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex flex-col items-center gap-2 ${breakType === t ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 shadow-lg shadow-indigo-100 dark:shadow-none' : 'border-bg dark:border-slate-800 bg-surface dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
                          >
                            {t === 'tea' && <Coffee size={16} />}
                            {t === 'lunch' && <Clock size={16} />}
                            {t === 'personal' && <Users size={16} />}
                            {t}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => action("/time/break/start/")}
                        disabled={busy}
                        className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-amber-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                        START {breakType.toUpperCase()} BREAK
                      </button>
                    </div>
                  ) : (
                    <div className="bg-surface dark:bg-slate-950 rounded-3xl border-2 border-amber-100 dark:border-amber-900/30 p-6 shadow-xl shadow-amber-50 dark:shadow-none space-y-6 animate-in zoom-in duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-100 dark:shadow-none">
                            <Coffee size={24} className="animate-bounce" />
                          </div>
                          <div>
                            <div className="text-lg font-black text-slate-900 dark:text-white">{openBreak.break_type?.toUpperCase()} BREAK</div>
                            <div className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">In Progress</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-none">{formatDuration(breakElapsed)}</div>
                          <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Live Timer</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-4 border-y border-stroke dark:border-slate-800">
                        <div className="space-y-1">
                          <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">Started At</div>
                          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatDateTime(openBreak.break_start).split(",")[1]}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">Current Status</div>
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500 font-bold text-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            ON BREAK
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => action("/time/break/end/")}
                        disabled={busy}
                        className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl text-sm font-black shadow-xl shadow-slate-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <Square size={14} fill="currentColor" />}
                        END BREAK SESSION
                      </button>
                    </div>
                  )}

                  {completedBreaks.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recent Sessions</div>
                      <div className="space-y-2">
                        {completedBreaks.slice(-2).reverse().map(b => (
                          <div key={b.id} className="p-3 bg-bg dark:bg-slate-950 rounded-xl border border-stroke dark:border-slate-800 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-surface dark:bg-slate-900 border border-stroke dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600">
                                <Coffee size={14} />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{b.break_type?.toUpperCase()}</div>
                                <div className="text-[9px] font-medium text-slate-400 dark:text-slate-500">{formatDateTime(b.break_start).split(",")[1]} - {formatDateTime(b.break_end).split(",")[1]}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-black text-slate-900 dark:text-white">{Math.round(b.duration_seconds / 60)}m</div>
                              <div className="text-[9px] font-black text-emerald-600 dark:text-emerald-500 uppercase">Done</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sliding Panel Footer */}
            <div className="px-8 pt-4 pb-2 border-t border-slate-100 bg-slate-50/50">
              {/* Phase 5 — preflight pill: instant geofence feedback */}
              {preflightPill && !openLog && (
                <div
                  className={`mb-4 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-bold ${preflightPill.tone === "ok"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : preflightPill.tone === "warn"
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : preflightPill.tone === "block"
                        ? "bg-rose-50 text-rose-800 border border-rose-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  role="status"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block w-2 h-2 rounded-full ${preflightPill.tone === "ok"
                      ? "bg-emerald-500"
                      : preflightPill.tone === "warn"
                        ? "bg-amber-500"
                        : preflightPill.tone === "block"
                          ? "bg-rose-500"
                          : "bg-slate-400"
                      }`}
                  />
                  {preflightPill.label}
                </div>
              )}
            </div>
            <div className="px-8 pb-8 bg-slate-50/50 dark:bg-slate-950/20 flex gap-4">
              <button
                onClick={() => setPanelOpen(false)}
                className="flex-1 py-4 rounded-2xl text-sm font-black text-slate-600 dark:text-slate-400 bg-surface dark:bg-slate-800 border border-stroke dark:border-slate-700 hover:bg-bg dark:hover:bg-slate-950/40 transition-all"
              >
                Cancel
              </button>
              {openLog ? (
                <button
                  onClick={handleClockOut}
                  disabled={busy}
                  className="flex-[2] py-4 rounded-2xl text-sm font-black text-white bg-red-500 hover:bg-red-600 shadow-xl shadow-red-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Square size={14} fill="currentColor" />}
                  {openLog.task ? "COMPLETE & EXIT" : "CLOCK OUT"}
                </button>
              ) : (
                <button
                  onClick={() => { setPanelOpen(false); action("/time/clock-in/") }}
                  disabled={
                    busy
                    || (!resolvedAddr && gpsStatus !== "error")
                    || !selfieFile
                    || (!geofencePassed && geofenceStatus?.geofence_enabled && geofenceStatus?.strict_mode)
                    // Phase 5: also block client-side when the preflight came
                    // back with allowed=false (server will reject too — this
                    // just saves a network round-trip).
                    || (preflight && preflight.allowed === false)
                  }
                  className={`flex-[2] py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all shadow-xl ${(!selfieFile || (!resolvedAddr && gpsStatus !== "error")) ? 'bg-slate-400' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100'}`}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Clock size={18} />}
                  SAVE SESSION
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes sosPulse{0%,100%{box-shadow:0 0 0 3px rgba(233,69,96,.35)}50%{box-shadow:0 0 0 6px rgba(233,69,96,.1)}}`}</style>
    </>
  )
}


// ═══════════════════════════════════════════════════════════════
//  ROUTER: admin vs employee
// ═══════════════════════════════════════════════════════════════
export function TimePage() {
  const { isAdmin } = useRole()
  return isAdmin ? <AdminTimePage /> : <EmployeeTimePage />
}
