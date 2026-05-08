import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { apiRequest, unwrapResults, API_BASE_URL } from "../../api/client.js"
import { getTokens } from "../../state/auth/tokens.js"
import { getAddress } from "../../api/geocoding.js"
import { formatDateTime, Card, Button, Pill, Input, Select, TextArea } from "../components/kit.jsx"
import { useAuth } from "../../state/auth/useAuth.js"
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

// ─── GPS helpers ──────────────────────────────────────────────
const DAILY_TARGET_HRS = 8
const GPS_TIMEOUT_MS = 15000
const TARGET_ACCURACY_M = 100

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
  useEffect(() => {
    if (!isClockedIn) return;

    const reportLocation = async () => {
      try {
        const pos = await getPosition()
        if (pos) {
          await apiRequest("/live-locations/update/", {
            method: "POST",
            json: { lat: pos.lat, lng: pos.lon }
          })
        }
      } catch (err) {
        console.debug("[LiveTracking] Report failed:", err)
      }
    }

    // Initial report
    reportLocation()

    // Every 5 minutes (reduced frequency to save DB connections)
    const id = setInterval(reportLocation, 300000)
    return () => clearInterval(id)
  }, [isClockedIn])
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
    <Card className={`flex-1 p-6 relative overflow-hidden group transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 ${isOT ? 'border-red-100 bg-red-50/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg transition-colors ${isOT ? 'bg-red-100 text-red-600' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
              {React.cloneElement(icon, { size: 16 })}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${isOT ? 'text-red-400' : 'text-slate-400'}`}>{label}</span>
          </div>
          <div className="space-y-1">
            <div className={`text-2xl font-black tracking-tight ${isOT ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
            {sub && (
              <div className={`text-[10px] font-bold ${isOT ? 'text-red-500' : 'text-slate-400'}`}>
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
      <div className={`absolute bottom-[-20%] right-[-10%] w-24 h-24 rounded-full opacity-[0.03] transition-transform duration-500 group-hover:scale-150 ${isOT ? 'bg-red-600' : 'bg-indigo-600'}`}></div>
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

  return (
    <div className="selfieOverlay">
      <div className="selfieSheet">
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
    </div>
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
    <div className="flex flex-col h-[calc(100vh-64px)] w-full bg-white overflow-hidden">
      {/* ── HEADER ── */}
      <div className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100">
            <Clock size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Attendance Ledger</h1>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enterprise Administrative View</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <Users size={16} className="text-slate-400" />
            <span className="text-xs font-black text-slate-700">{employees.length} Personnel Managed</span>
          </div>
          <button 
            onClick={load}
            className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-all"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
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
          {/* Left Panel: Stats & Quick Roster */}
          <div className="w-full xl:w-80 shrink-0 space-y-8">
            <Card className="p-6 bg-indigo-600 text-white border-none shadow-2xl shadow-indigo-200">
              <div className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Monthly Attendance</div>
              <div className="text-4xl font-black tracking-tight">{monthStats.attendancePct}%</div>
              <div className="mt-4 text-xs font-bold text-indigo-100">{monthNames[selectedMonth]} Performance</div>
              <div className="mt-6 h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: `${monthStats.attendancePct}%` }}></div>
              </div>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Personnel Cards</h2>
                <ChevronDown size={14} className="text-slate-400" />
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {empStatus.map(e => {
                  const empLogs = logs.filter(l => l.employee === e.id)
                  const presentCount = empLogs.filter(l => !!l.clock_in).length
                  return (
                    <div key={e.id} className="group p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 hover:bg-white transition-all">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center font-black text-slate-400 text-xs group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-all">
                          {e.avatarLetter}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">{e.name}</div>
                          <div className="text-[9px] font-bold text-slate-400">@{e.username}</div>
                        </div>
                        {e.log && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="px-2 py-1 bg-white rounded-lg text-[9px] font-bold text-slate-400">Days: {monthStats.daysInMonth}</div>
                        <div className="px-2 py-1 bg-white rounded-lg text-[9px] font-black text-emerald-500">Present: {presentCount}</div>
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
            <div className="bg-slate-50/50 p-1.5 rounded-2xl flex items-center gap-1 overflow-x-auto no-scrollbar">
              {monthNames.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(idx)}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${selectedMonth === idx ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Calendar & KPIs Row */}
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Calendar Grid */}
              <Card className="flex-1 p-6 bg-white border-slate-100 shadow-sm">
                <div className="grid grid-cols-8 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100">
                  {/* Header */}
                  <div className="bg-slate-50 p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">WEEK</div>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                    <div key={day} className="bg-slate-50 p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{day}</div>
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
                        <div className="bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-300">W{wIdx + 1}</div>
                        {week.map((day, dIdx) => {
                          const dateStr = day ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
                          const dayLogs = day ? logs.filter(l => l.work_date === dateStr) : []
                          const isWeekend = dIdx === 0 || dIdx === 6
                          const attendancePct = dayLogs.length > 0 && employees.length > 0 ? Math.round((dayLogs.length / employees.length) * 100) : 0
                          
                          return (
                            <div key={`d-${wIdx}-${dIdx}`} className={`bg-white aspect-square p-2 relative ${!day ? 'bg-slate-50/30' : ''}`}>
                              {day && (
                                <>
                                  <span className={`text-[11px] font-black ${isWeekend ? 'text-slate-300' : 'text-slate-900'}`}>{day}</span>
                                  <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center gap-1">
                                    {dayLogs.length > 0 ? (
                                      <div className={`w-1 h-1 rounded-full ${attendancePct > 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                    ) : !isWeekend && (
                                      <div className="w-1 h-1 rounded-full bg-red-400"></div>
                                    )}
                                    {dayLogs.length > 0 && <span className="text-[8px] font-black text-slate-400">{attendancePct}%</span>}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                        {week.length < 7 && [...Array(7 - week.length)].map((_, i) => <div key={`pad-${i}`} className="bg-slate-50/30"></div>)}
                      </React.Fragment>
                    ))
                  })()}
                </div>
              </Card>

              {/* KPI Summary Cards */}
              <div className="w-full lg:w-72 grid grid-cols-2 lg:grid-cols-1 gap-4">
                <Card className="p-5 border-slate-100 bg-slate-50/50">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Monthly Activity</div>
                  <div className="text-2xl font-black text-slate-900">{monthStats.totalDays}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Logs Captured</div>
                </Card>
                <Card className="p-5 border-slate-100 bg-slate-50/50">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Headcount Active</div>
                  <div className="text-2xl font-black text-slate-900">{monthStats.totalAttendance}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Unique Personnel</div>
                </Card>
                <Card className="p-5 border-slate-100 bg-slate-50/50">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">System Target</div>
                  <div className="text-2xl font-black text-slate-900">{monthStats.totalWorkingDays}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Expected Log Count</div>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* ── DETAILED LOGS SECTION ── */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
              <h2 className="text-lg font-black text-slate-900">Audit Ledger</h2>
              <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">{filteredLogs.length} Records</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setLogsOpen(!logsOpen)}
                className={`p-2 rounded-xl border transition-all ${logsOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}
              >
                <Filter size={18} />
              </button>
            </div>
          </div>

          {logsOpen && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
              {/* Table Filters */}
              <Card className="p-4 bg-white border-slate-100 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2 border border-slate-100 flex-1">
                    <Search size={16} className="text-slate-300" />
                    <input 
                      type="text" 
                      placeholder="Search personnel or date..." 
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      className="bg-transparent border-none text-sm font-bold outline-none w-full"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Filter</div>
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm font-bold outline-none"
                    >
                      <option value="all">All Records</option>
                      <option value="live">Live Now</option>
                      <option value="submitted">In Review</option>
                      <option value="done">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-xl p-1">
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="bg-transparent text-[10px] font-black px-2 outline-none" />
                    <ChevronRight size={12} className="text-slate-300" />
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="bg-transparent text-[10px] font-black px-2 outline-none" />
                  </div>
                </div>
              </Card>

              {/* Data Table */}
              <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Shift Date</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Photos</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Duration</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredLogs.map(l => (
                        <AdminLogRow key={l.id} log={l} onAction={load} />
                      ))}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-20 text-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400">
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
    <tr className={`group hover:bg-slate-50/50 transition-colors ${isLive ? 'bg-indigo-50/30' : ''}`}>
      <td className="p-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${isLive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {(log.employee_name || "?").charAt(0)}
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">{log.employee_name}</div>
            <div className="text-[10px] font-bold text-slate-400">@{log.employee_username}</div>
          </div>
        </div>
      </td>
      <td className="p-6">
        <div className="text-sm font-bold text-slate-700">{log.work_date}</div>
      </td>
      <td className="p-6">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">In</span>
              <span className="text-sm font-bold text-slate-700">{formatDateTime(log.clock_in).split(",")[1]}</span>
            </div>
            {log.clock_out && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase">Out</span>
                <span className="text-sm font-bold text-slate-700">{formatDateTime(log.clock_out).split(",")[1]}</span>
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
            <a href={log.clock_in_photo} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 shadow-sm hover:scale-110 transition-transform">
              <img src={log.clock_in_photo} className="w-full h-full object-cover" />
            </a>
          )}
          {log.clock_out_photo && (
            <a href={log.clock_out_photo} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 shadow-sm hover:scale-110 transition-transform">
              <img src={log.clock_out_photo} className="w-full h-full object-cover" />
            </a>
          )}
          {!log.clock_in_photo && !log.clock_out_photo && <span className="text-[10px] font-bold text-slate-300">N/A</span>}
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
        <div className={`text-sm font-black ${workedSeconds > 8 * 3600 ? 'text-red-600' : 'text-slate-900'}`}>
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
  const displayName = user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
    : "Employee"

  const [logs, setLogs] = useState([])
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

  // Start live location reporting if clocked in
  useLocationTracker(!!openLog && !openBreak)

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
      : dist < 1000 ? ` · ${dist}m` : ` · ${(dist/1000).toFixed(1)}km`

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
      const [logsRes] = await Promise.allSettled([apiRequest(`/time/logs/?${params}`)])
      if (logsRes.status === "fulfilled") setLogs(unwrapResults(logsRes.value))
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
      setFaceVerifyStatus(null); setFaceVerifyScore(null)
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
  const [panelOpen, setPanelOpen] = useState(false)
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

              // Get clock-in photo URL
              const clockInPhoto = openLog.clock_in_photo;
              if (clockInPhoto && preview) {
                try {
                  const result = await verifyFaces(clockInPhoto, preview);
                  setFaceVerifyScore(result.score);
                  if (result.status === 'mismatch') {
                    setFaceVerifyStatus('mismatch');
                    setError('⚠️ Identity Verification Failed: Your clock-out selfie does not match your clock-in photo. Please contact your manager or administrator to manually clock you out if you are trapped.');
                    return; // BLOCK clock-out
                  }
                  if (result.status === 'no_face') {
                    setFaceVerifyStatus('no_face');
                    setError('⚠️ No face detected in the photos! If your original clock-in photo was blurry or faceless, you cannot verify your identity to clock out. Please contact your admin to manually log or reset your shift.');
                    return; // BLOCK clock-out
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
      {showMoodSurvey && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <Card className="max-w-md w-full p-10 text-center shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
            <h2 className="text-2xl font-black text-slate-900 mb-8 tracking-tight">How was work today?</h2>
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
          </Card>
        </div>
      )}

      {/* ═══ MAIN PAGE ═══ */}
      <div className="flex flex-col h-[calc(100vh-64px)] w-full bg-white overflow-hidden">
        {/* Header Row */}
        <div className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100">
              <Clock size={24} className={openLog ? 'animate-pulse' : ''} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Personal Timesheets</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${openLog ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {openLog ? (openBreak ? 'Currently on Break' : 'On Active Duty') : 'System Standby'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {openLog && (
              <div className="flex items-center bg-slate-900 text-white rounded-2xl px-1.5 py-1.5 shadow-xl shadow-slate-200">
                <div className="px-4 py-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none">Session</span>
                  <span className="text-lg font-black tabular-nums">{formatDuration(elapsed)}</span>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {!openBreak ? (
                    <>
                      <button onClick={() => action("/time/break/start/")} className="p-2.5 bg-slate-800 hover:bg-amber-500 text-white rounded-xl transition-all" title="Start Break"><Coffee size={16} /></button>
                      <button onClick={() => setPanelOpen(true)} className="p-2.5 bg-slate-800 hover:bg-emerald-500 text-white rounded-xl transition-all" title="Job Photo"><Camera size={16} /></button>
                      <button onClick={handleClockOut} className="p-2.5 bg-slate-800 hover:bg-red-500 text-white rounded-xl transition-all" title="Clock Out"><Square size={14} fill="currentColor" /></button>
                    </>
                  ) : (
                    <button onClick={() => action("/time/break/end/")} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl flex items-center gap-2 transition-all"><Play size={14} /> RESUME</button>
                  )}
                  <button onClick={() => setPanelOpen(true)} className="p-2.5 bg-slate-800 hover:bg-indigo-500 text-white rounded-xl transition-all" title="Details"><Edit3 size={16} /></button>
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
                  sub="Active tracking"
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
                <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                <h2 className="text-lg font-black text-slate-900">Personal Ledger</h2>
                <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">{logs.length} Entries</span>
              </div>
              
              <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-xl border border-slate-100">
                <button onClick={() => { setFilterFrom(todayStr); setFilterTo(todayStr) }} className="px-4 py-1.5 text-[10px] font-black text-slate-500 hover:text-indigo-600 uppercase tracking-widest">Today</button>
                <button onClick={() => { setFilterFrom(weekAgo); setFilterTo(todayStr) }} className="px-4 py-1.5 bg-white shadow-sm rounded-lg text-[10px] font-black text-indigo-600 uppercase tracking-widest">Week</button>
                <button onClick={() => { const m = new Date(); m.setDate(1); setFilterFrom(m.toLocaleDateString("en-CA")); setFilterTo(todayStr) }} className="px-4 py-1.5 text-[10px] font-black text-slate-500 hover:text-indigo-600 uppercase tracking-widest">Month</button>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline</th>
                      <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification</th>
                      <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Approval Status</th>
                      <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      [1, 2, 3].map(i => (
                        <tr key={i}>
                          <td colSpan={5} className="p-6"><Skeleton h="40px" /></td>
                        </tr>
                      ))
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-20 text-center">
                          <div className="flex flex-col items-center gap-4 text-slate-400">
                            <Clock size={48} className="opacity-10" />
                            <div className="font-bold">No attendance records found</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      logs.map(l => {
                        const isRowActive = !l.clock_out
                        const dur = isRowActive ? elapsed : l.worked_seconds
                        return (
                          <tr key={l.id} className={`group hover:bg-slate-50/50 transition-colors ${isRowActive ? 'bg-indigo-50/30' : ''}`}>
                            <td className="p-6">
                              <div className="text-sm font-bold text-slate-700">{l.work_date}</div>
                            </td>
                            <td className="p-6">
                              <div className="flex items-center gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">In</span>
                                    <span className="text-sm font-bold text-slate-700">{formatDateTime(l.clock_in).split(",")[1]}</span>
                                  </div>
                                  {l.clock_out && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-400 uppercase">Out</span>
                                      <span className="text-sm font-bold text-slate-700">{formatDateTime(l.clock_out).split(",")[1]}</span>
                                    </div>
                                  )}
                                </div>
                                {isRowActive && <div className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full animate-pulse">LIVE</div>}
                              </div>
                            </td>
                            <td className="p-6">
                              <div className="flex items-center gap-2">
                                {l.clock_in_photo && (
                                  <a href={l.clock_in_photo} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 shadow-sm hover:scale-110 transition-transform">
                                    <img src={l.clock_in_photo} className="w-full h-full object-cover" />
                                  </a>
                                )}
                                {l.clock_out_photo && (
                                  <a href={l.clock_out_photo} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 shadow-sm hover:scale-110 transition-transform">
                                    <img src={l.clock_out_photo} className="w-full h-full object-cover" />
                                  </a>
                                )}
                                {!l.clock_in_photo && !l.clock_out_photo && <span className="text-[10px] font-bold text-slate-300">N/A</span>}
                              </div>
                            </td>
                            <td className="p-6">
                              <div className="flex items-center gap-3">
                                <Pill variant={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : l.status === 'submitted' ? 'warning' : 'neutral'}>
                                  {l.status === 'submitted' ? 'In Review' : (l.status || (isRowActive ? 'Active' : 'Draft'))}
                                </Pill>
                                {l.status === 'draft' && <button onClick={() => submitLog(l.id)} className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg">SUBMIT</button>}
                                {l.clock_out && <button onClick={() => downloadLogPdf(l.id)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"><FileText size={14} /></button>}
                              </div>
                            </td>
                            <td className="p-6 text-right">
                              <div className={`text-sm font-black ${dur > 8 * 3600 ? 'text-red-600' : 'text-slate-900'}`}>
                                {formatDuration(dur)}
                              </div>
                              {dur > 8 * 3600 && <div className="text-[9px] font-black text-red-400 uppercase">OT +{formatDuration(dur - 8 * 3600)}</div>}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SLIDE-OUT OPERATION PANEL ═══ */}
      {panelOpen && (
        <div className="fixed inset-0 z-[1000] flex justify-end animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            {/* Header */}
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">{openLog ? 'Complete Shift' : 'Initiate Session'}</h3>
                {openLog && <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Started {formatDateTime(openLog.clock_in).split(",")[1]}</div>}
              </div>
              <button onClick={() => setPanelOpen(false)} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-900 flex items-center justify-center transition-all">✕</button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {/* Telemetry Status */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <MapPin size={18} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-slate-900 truncate">{resolvedAddr || "Locating precision coordinates..."}</div>
                  {currentGPS && <div className="text-[10px] font-bold text-slate-400 mt-0.5">{currentGPS.lat.toFixed(5)}, {currentGPS.lon.toFixed(5)}</div>}
                </div>
                <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${gpsStatus === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {gpsStatus === 'ok' ? 'LOCKED' : 'LINKING'}
                </div>
              </div>

              {geofenceError && geofenceStatus?.strict_mode && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} /> {geofenceError}
                </div>
              )}

              {/* Identity Verification (Clock-in only) */}
              {!openLog && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identity Verification</label>
                  <button 
                    onClick={() => setShowSelfie(true)} 
                    className={`w-full h-40 rounded-3xl border-2 border-dashed transition-all overflow-hidden relative ${selfiePreview ? 'border-indigo-600' : 'border-slate-200 hover:border-indigo-400 bg-slate-50'}`}
                  >
                    {selfiePreview ? (
                      <img src={selfiePreview} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Camera size={32} className="text-slate-300" />
                        <span className="text-xs font-black text-slate-400">TAP TO CAPTURE SELFIE</span>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operation Notes</label>
                <textarea 
                  value={sessionNotes} 
                  onChange={e => setSessionNotes(e.target.value)} 
                  placeholder={openLog ? "Summary of completed tasks..." : "Briefly describe your objectives..."}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all" 
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

              {/* Break Operations */}
              {openLog && (
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operational Break</label>
                  {!openBreak ? (
                    <div className="grid grid-cols-3 gap-3">
                      {["lunch", "short", "personal"].map(t => (
                        <button 
                          key={t} 
                          onClick={() => setBreakType(t)}
                          className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${breakType === t ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-white text-slate-400'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Coffee size={18} className="text-amber-600 animate-bounce" />
                        <div>
                          <div className="text-sm font-black text-amber-900">On Break: {openBreak.break_type?.toUpperCase()}</div>
                          <div className="text-xs font-bold text-amber-600 tabular-nums">{formatDuration(breakElapsed)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {completedBreaks.length > 0 && (
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Coffee size={12} /> {completedBreaks.length} Session(s) Completed • {formatDuration(totalBreakSecs)}
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
                  className={`mb-4 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-bold ${
                    preflightPill.tone === "ok"
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
                    className={`inline-block w-2 h-2 rounded-full ${
                      preflightPill.tone === "ok"
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
            <div className="px-8 pb-8 bg-slate-50/50 flex gap-4">
              <button
                onClick={() => setPanelOpen(false)}
                className="flex-1 py-4 rounded-2xl text-sm font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all"
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
    </>
  )
}


// ═══════════════════════════════════════════════════════════════
//  ROUTER: admin vs employee
// ═══════════════════════════════════════════════════════════════
export function TimePage() {
  const { user } = useAuth()
  return user?.role === "admin" ? <AdminTimePage /> : <EmployeeTimePage />
}
