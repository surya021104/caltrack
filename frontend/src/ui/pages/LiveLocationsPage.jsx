/**
 * LiveLocationsPage — Layer 4: Real-time tracking dashboard
 *
 * Features:
 *  • WebSocket live location stream (admin WS consumer)
 *  • Colour-coded presence pins: active=green, on_break=amber,
 *    outside_geofence=red, idle=orange, offline=grey
 *  • Employee status sidebar cards with click-to-pan
 *  • SOS alert banner with audio notification
 *  • Geofence breach toast log
 *  • ETA prediction modal
 *  • Live shift heatmap toggle
 *  • Dispatcher task assignment (click employee → assign pending task)
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  Paperclip,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  Timer,
  User,
  Users,
  X,
  Zap,
} from "lucide-react"

import { useWebSocket } from "../../hooks/useWebSocket.js"
import {
  acknowledgeSos,
  addGeofenceBreach,
  addSosAlert,
  applyEmployeePing,
  applySnapshot,
  refreshPresence,
  selectActiveSosAlerts,
  selectConnected,
  selectEmployeeList,
  setConnected,
} from "../../store/liveLocationSlice.js"
import { apiRequest, unwrapResults } from "../../api/client.js"

// ── Fix Leaflet default icons ─────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// ── Status config ─────────────────────────────────────────────────────────
const STATUS = {
  active:           { color: "#059669", label: "Active",            ring: "#D1FAE5" },
  on_break:         { color: "#f59e0b", label: "On Break",          ring: "#FEF3C7" },
  idle:             { color: "#f97316", label: "Idle",              ring: "#FFEDD5" },
  offline:          { color: "#94a3b8", label: "Offline",           ring: "#F1F5F9" },
  outside_geofence: { color: "#E94560", label: "Outside Geofence",  ring: "#FEE2E2" },
}
const getStatus = (s) => STATUS[s] || STATUS.active

// ── Custom Leaflet marker ─────────────────────────────────────────────────
function createEmployeeMarker(photoUrl, name, statusKey, isSelected) {
  const cfg = getStatus(statusKey)
  const border = isSelected ? "#5d5fef" : cfg.color
  const size = isSelected ? 56 : 46
  const shadow = isSelected
    ? "0 8px 24px rgba(93,95,239,0.45)"
    : "0 4px 12px rgba(0,0,0,0.25)"

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:${size + 16}px">
        <div style="
          width:${size}px;height:${size}px;border-radius:${isSelected ? 18 : 14}px;
          border:3px solid ${border};box-shadow:${shadow};overflow:hidden;
          background:${photoUrl ? "transparent" : "#f1f5f9"};
          transition:all 0.25s ease;transform:${isSelected ? "scale(1.12)" : "scale(1)"}
        ">
          ${photoUrl
            ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover"/>`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${border}22;color:${border};font-weight:900;font-size:${isSelected ? 20 : 16}px;font-family:sans-serif">${name.charAt(0).toUpperCase()}</div>`
          }
        </div>
        <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid ${border};margin-top:-4px;filter:drop-shadow(0 3px 2px rgba(0,0,0,.12))"></div>
        <div style="position:absolute;bottom:4px;right:2px;width:12px;height:12px;border-radius:50%;background:${cfg.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>
      </div>`,
    iconSize: [size + 16, size + 18],
    iconAnchor: [(size + 16) / 2, size + 18],
    popupAnchor: [0, -(size + 10)],
  })
}

// ── Map helpers ───────────────────────────────────────────────────────────
function MapController({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center && center[0] !== 0) map.flyTo(center, zoom || 14, { duration: 0.8 })
  }, [center, zoom, map])
  return null
}

// ── Duration formatter ────────────────────────────────────────────────────
function fmtDuration(s) {
  if (!s && s !== 0) return "--:--"
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, "0")}`
}

function fmtTime(iso) {
  if (!iso) return "--:--"
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// ── SOS sound (single beep via Web Audio) ────────────────────────────────
function playSOSBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = "square"
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch { /* audio blocked */ }
}

// ──────────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────────

export function LiveLocationsPage() {
  const dispatch = useDispatch()
  const employees = useSelector(selectEmployeeList)
  const activeSos = useSelector(selectActiveSosAlerts)
  const connected = useSelector(selectConnected)

  // Local UI state
  const [selectedEmpId, setSelectedEmpId] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("name")
  const [mapCenter, setMapCenter] = useState([12.9716, 80.0414])
  const [mapZoom, setMapZoom] = useState(13)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatmapPoints, setHeatmapPoints] = useState([])
  const [showETA, setShowETA] = useState(false)
  const [etaTarget, setEtaTarget] = useState({ lat: "", lng: "" })
  const [etaResults, setEtaResults] = useState(null)
  const [loadingETA, setLoadingETA] = useState(false)
  const [pendingTasks, setPendingTasks] = useState([])
  const [assignTarget, setAssignTarget] = useState(null) // employee being assigned a task
  const [toasts, setToasts] = useState([]) // { id, type, message }
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [mapStyle, setMapStyle] = useState("map") // map | satellite
  const [filterStatus, setFilterStatus] = useState("all")
  const toastIdRef = useRef(0)

  // ── WS connection ─────────────────────────────────────────────────────

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case "snapshot":
        dispatch(applySnapshot(msg))
        break

      case "employee_ping": {
        dispatch(applyEmployeePing(msg.data))
        if (msg.breach) {
          dispatch(addGeofenceBreach(msg.breach))
          addToast("breach", `⚠ ${msg.breach.employee_name} is ${msg.breach.distance_meters}m outside ${msg.breach.location}`)
        }
        break
      }

      case "sos_alert": {
        dispatch(addSosAlert(msg.data))
        if (soundEnabled) playSOSBeep()
        addToast("sos", `🆘 SOS from ${msg.data.employee_name}`)
        break
      }

      case "sos_acknowledged":
        dispatch(acknowledgeSos({ sos_id: msg.sos_id, acknowledged_by: msg.acknowledged_by }))
        break

      case "task_assigned_ack":
        addToast("success", `✓ Task assigned to ${msg.task.employee_name}`)
        break

      default:
        break
    }
  }, [dispatch, soundEnabled])

  const { send, readyState } = useWebSocket("/ws/live/admin/", {
    onMessage: handleWsMessage,
    onConnect: () => dispatch(setConnected(true)),
    onDisconnect: () => dispatch(setConnected(false)),
  })

  // ── Presence refresh timer ────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => dispatch(refreshPresence()), 60_000)
    return () => clearInterval(id)
  }, [dispatch])

  // ── Toast helpers ─────────────────────────────────────────────────────
  const addToast = useCallback((type, message) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 6))
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000)
  }, [])

  // ── Heatmap data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showHeatmap) return
    apiRequest("/live-locations/heatmap/")
      .then((res) => setHeatmapPoints(res?.points || []))
      .catch(() => {})
  }, [showHeatmap])

  // ── Pending tasks for dispatcher ──────────────────────────────────────
  useEffect(() => {
    apiRequest("/tasks/admin/?status=pending")
      .then((res) => setPendingTasks(unwrapResults(res) || []))
      .catch(() => {})
  }, [])

  // ── Detail view for selected employee ────────────────────────────────
  useEffect(() => {
    if (!selectedEmpId) { setDetailData(null); return }
    const emp = employees.find((e) => e.employee_id === selectedEmpId)
    if (!emp?.time_log_id) return

    setLoadingDetail(true)
    apiRequest(`/live-locations/session/${emp.time_log_id}/`)
      .then((data) => {
        setDetailData(data)
        if (data.history?.length) {
          const last = data.history[data.history.length - 1]
          setMapCenter([parseFloat(last.lat), parseFloat(last.lng)])
          setMapZoom(16)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }, [selectedEmpId])

  // ── ETA fetch ─────────────────────────────────────────────────────────
  const fetchETA = async () => {
    if (!etaTarget.lat || !etaTarget.lng) return
    setLoadingETA(true)
    try {
      const res = await apiRequest(
        `/live-locations/eta/?lat=${etaTarget.lat}&lng=${etaTarget.lng}`
      )
      setEtaResults(Array.isArray(res) ? res : [])
    } catch { setEtaResults([]) }
    finally { setLoadingETA(false) }
  }

  // ── Task assignment via WS ─────────────────────────────────────────────
  const assignTask = (taskId, employeeId) => {
    send({ type: "assign_task", task_id: taskId, employee_id: employeeId })
    setAssignTarget(null)
  }

  // ── SOS acknowledge ───────────────────────────────────────────────────
  const ackSos = (sosId) => {
    send({ type: "acknowledge_sos", sos_id: sosId })
  }

  // ── Filtered & sorted employee list ──────────────────────────────────
  const filteredEmployees = useMemo(() => {
    let arr = [...employees]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      arr = arr.filter(
        (e) =>
          e.employee_name?.toLowerCase().includes(q) ||
          e.job_site_name?.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== "all") arr = arr.filter((e) => e.status === filterStatus)
    arr.sort((a, b) => {
      if (sortBy === "name") return (a.employee_name || "").localeCompare(b.employee_name || "")
      if (sortBy === "duration") return (b.worked_seconds || 0) - (a.worked_seconds || 0)
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "")
      return 0
    })
    return arr
  }, [employees, searchQuery, sortBy, filterStatus])

  // ── Polyline for selected employee's trail ────────────────────────────
  const trailPositions = useMemo(() => {
    if (!detailData?.history) return []
    return detailData.history.map((h) => [parseFloat(h.lat), parseFloat(h.lng)])
  }, [detailData])

  const tileUrl =
    mapStyle === "satellite"
      ? "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
      : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"

  // ── Count by status ───────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts = { active: 0, on_break: 0, idle: 0, offline: 0, outside_geofence: 0 }
    employees.forEach((e) => { if (counts[e.status] !== undefined) counts[e.status]++ })
    return counts
  }, [employees])

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", overflow: "hidden", background: "var(--bg)", animation: "fadeUp 0.4s ease both" }}>

      {/* ── SOS Banner ────────────────────────────────────────────────── */}
      {activeSos.length > 0 && (
        <div style={{ background: "#E94560", color: "white", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, animation: "fadeUp 0.3s ease" }}>
          <ShieldAlert size={20} style={{ flexShrink: 0, animation: "pulse 1s infinite" }} />
          <span style={{ fontWeight: 900, fontSize: 13 }}>
            {activeSos.length} ACTIVE SOS ALERT{activeSos.length > 1 ? "S" : ""}:
          </span>
          <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {activeSos.slice(0, 3).map((sos) => (
              <span key={sos.id} style={{ background: "rgba(255,255,255,0.2)", borderRadius: 8, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                {sos.employee_name} · {fmtTime(sos.timestamp)}
              </span>
            ))}
          </div>
          <button
            onClick={() => ackSos(activeSos[0].id)}
            style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, color: "white", padding: "4px 14px", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
          >
            ACKNOWLEDGE
          </button>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ height: 64, background: "var(--surface)", borderBottom: "1px solid var(--stroke)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#5d5fef", color: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(93,95,239,.3)" }}>
            <Activity size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--fg)" }}>Live Operations</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#059669" : "#E94560", boxShadow: connected ? "0 0 0 4px rgba(5,150,105,.2)" : "none", transition: "all 0.3s" }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {connected ? "WebSocket Live" : "Reconnecting…"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Status summary pills */}
          {Object.entries(statusCounts).filter(([, n]) => n > 0).map(([s, n]) => (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 20, border: `1.5px solid ${filterStatus === s ? getStatus(s).color : "var(--stroke)"}`,
                background: filterStatus === s ? getStatus(s).ring : "transparent",
                color: getStatus(s).color, fontSize: 11, fontWeight: 800, cursor: "pointer",
              }}
            >
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: getStatus(s).color }} />
              {n} {getStatus(s).label}
            </button>
          ))}
          <div style={{ width: 1, height: 28, background: "var(--stroke)", margin: "0 4px" }} />
          <button onClick={() => setSoundEnabled((v) => !v)} title={soundEnabled ? "Mute alerts" : "Unmute alerts"} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--stroke)", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}>
            {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
          <button
            onClick={() => setShowETA(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 10, border: "1px solid var(--stroke)", background: "transparent", cursor: "pointer", color: "var(--fg)", fontSize: 12, fontWeight: 700 }}
          >
            <Timer size={14} /> ETA
          </button>
        </div>
      </div>

      {/* ── Toast log ─────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            padding: "10px 16px", borderRadius: 12, fontWeight: 700, fontSize: 13,
            background: t.type === "sos" ? "#E94560" : t.type === "breach" ? "#f59e0b" : "#059669",
            color: "white", boxShadow: "0 4px 16px rgba(0,0,0,.2)",
            animation: "fadeUp 0.3s ease",
            pointerEvents: "all",
            maxWidth: 320,
          }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Main content: map + sidebar ──────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ── MAP ───────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative" }}>
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ width: "100%", height: "100%" }}
            zoomControl={false}
          >
            <MapController center={mapCenter} zoom={mapZoom} />
            <TileLayer url={tileUrl} attribution="&copy; Google Maps" />

            {/* Employee markers */}
            {filteredEmployees.map((emp) => (
              <Marker
                key={emp.employee_id}
                position={[parseFloat(emp.lat || 0), parseFloat(emp.lng || 0)]}
                icon={createEmployeeMarker(
                  emp.clock_in_photo,
                  emp.employee_name || "?",
                  emp.status,
                  selectedEmpId === emp.employee_id
                )}
                eventHandlers={{
                  click: () => {
                    setSelectedEmpId(emp.employee_id)
                    setMapCenter([parseFloat(emp.lat), parseFloat(emp.lng)])
                    setMapZoom(16)
                  },
                }}
              >
                <Popup>
                  <div style={{ textAlign: "center", padding: 4 }}>
                    <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4 }}>{emp.employee_name}</div>
                    <div style={{ fontSize: 11, color: getStatus(emp.status).color, fontWeight: 800, textTransform: "uppercase" }}>{getStatus(emp.status).label}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{emp.job_site_name}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Last ping: {fmtTime(emp.timestamp)}</div>
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 800, marginTop: 4 }}>{fmtDuration(emp.worked_seconds)} worked</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Selected employee trail */}
            {trailPositions.length > 1 && (
              <Polyline
                positions={trailPositions}
                pathOptions={{ color: "#5d5fef", weight: 4, opacity: 0.8, lineCap: "round", lineJoin: "round", dashArray: "8 4" }}
              />
            )}

            {/* Heatmap — simple circles for density */}
            {showHeatmap && heatmapPoints.map(([lat, lng, weight], i) => (
              <Circle
                key={i}
                center={[lat, lng]}
                radius={80}
                pathOptions={{
                  color: "transparent",
                  fillColor: `hsl(${Math.round((1 - weight) * 120)}, 80%, 50%)`,
                  fillOpacity: Math.min(weight * 0.6, 0.5),
                }}
              />
            ))}

            {/* SOS alert pins */}
            {activeSos.map((sos) =>
              sos.lat && sos.lng ? (
                <Marker
                  key={`sos-${sos.id}`}
                  position={[parseFloat(sos.lat), parseFloat(sos.lng)]}
                  icon={L.divIcon({
                    className: "",
                    html: `<div style="width:36px;height:36px;border-radius:50%;background:#E94560;border:3px solid white;box-shadow:0 0 0 4px rgba(233,69,96,0.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:16px;animation:pulse 1s infinite">🆘</div>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18],
                  })}
                >
                  <Popup>
                    <div style={{ textAlign: "center", padding: 4 }}>
                      <div style={{ fontWeight: 900, color: "#E94560", fontSize: 14 }}>🆘 SOS ALERT</div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{sos.employee_name}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{fmtTime(sos.timestamp)}</div>
                      <button
                        onClick={() => ackSos(sos.id)}
                        style={{ marginTop: 8, padding: "4px 12px", background: "#E94560", color: "white", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                      >
                        Acknowledge
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ) : null
            )}
          </MapContainer>

          {/* ── Map overlays ───────────────────────────────────────── */}
          <div style={{ position: "absolute", top: 16, left: 16, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Map style toggle */}
            <div style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: 12, padding: 4, display: "flex", gap: 4, boxShadow: "0 2px 12px rgba(0,0,0,.12)" }}>
              {["map", "satellite"].map((s) => (
                <button
                  key={s}
                  onClick={() => setMapStyle(s)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, border: "none",
                    background: mapStyle === s ? "#1e293b" : "transparent",
                    color: mapStyle === s ? "white" : "#64748b",
                    fontSize: 11, fontWeight: 800, textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Heatmap toggle */}
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: showHeatmap ? "#5d5fef" : "rgba(255,255,255,0.95)",
                color: showHeatmap ? "white" : "#475569",
                backdropFilter: "blur(8px)", borderRadius: 10, padding: "6px 12px",
                border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 2px 12px rgba(0,0,0,.12)",
              }}
            >
              <Layers size={14} />
              {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
            </button>
          </div>

          {/* Employee count badge */}
          <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1000, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: 12, padding: "8px 14px", boxShadow: "0 2px 12px rgba(0,0,0,.12)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Online</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>{employees.length}</div>
          </div>
        </div>

        {/* ── SIDEBAR ───────────────────────────────────────────────── */}
        <div style={{
          width: 380, height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--stroke)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "-8px 0 24px rgba(0,0,0,.04)"
        }}>
          {!selectedEmpId ? (
            /* ── Employee roster list ─────────────────────────────── */
            <>
              <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid var(--stroke2)", background: "var(--bg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Active Roster</span>
                  <button
                    onClick={() => setSortBy((v) => v === "name" ? "duration" : v === "duration" ? "status" : "name")}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#5d5fef", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <ArrowUpDown size={12} /> {sortBy === "name" ? "Alpha" : sortBy === "duration" ? "Duration" : "Status"}
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search personnel…"
                    style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 10, border: "1.5px solid var(--stroke)", background: "var(--surface)", color: "var(--fg)", fontSize: 13, fontWeight: 600, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                {employees.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", gap: 12, textAlign: "center", padding: "0 32px" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Users size={28} style={{ opacity: 0.3 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "var(--fg)" }}>No signals detected</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Nobody is clocked in with tracking active.</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filteredEmployees.map((emp) => {
                      const cfg = getStatus(emp.status)
                      const isSelected = selectedEmpId === emp.employee_id
                      return (
                        <div
                          key={emp.employee_id}
                          onClick={() => setSelectedEmpId(emp.employee_id)}
                          style={{
                            padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                            background: isSelected ? "#1e293b" : "var(--surface)",
                            border: `1.5px solid ${isSelected ? "#1e293b" : "var(--stroke)"}`,
                            transition: "all 0.18s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {/* Avatar */}
                            <div style={{ position: "relative", flexShrink: 0 }}>
                              <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", background: `${cfg.color}22`, border: `2px solid ${cfg.color}44` }}>
                                {emp.clock_in_photo
                                  ? <img src={emp.clock_in_photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: cfg.color }}>{emp.employee_name?.charAt(0).toUpperCase()}</div>
                                }
                              </div>
                              <div style={{ position: "absolute", bottom: -3, right: -3, width: 12, height: 12, borderRadius: "50%", background: cfg.color, border: "2px solid var(--surface)" }} />
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: isSelected ? "white" : "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.employee_name}</div>
                              <div style={{ fontSize: 11, color: isSelected ? cfg.color : "var(--muted)", fontWeight: 700, marginTop: 1 }}>{emp.job_site_name}</div>
                            </div>

                            {/* Status + time */}
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: cfg.color, padding: "2px 7px", borderRadius: 6, background: `${cfg.color}18` }}>{cfg.label}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? "#94a3b8" : "var(--muted)", marginTop: 3 }}>{fmtDuration(emp.worked_seconds)}</div>
                            </div>

                            {/* Assign task button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setAssignTarget(emp) }}
                              title="Assign task"
                              style={{ padding: 6, borderRadius: 8, border: "1px solid var(--stroke)", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex", flexShrink: 0 }}
                            >
                              <Target size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Employee detail view ─────────────────────────────── */
            <div style={{ display: "flex", flexDirection: "column", height: "100%", animation: "fadeUp 0.3s ease" }}>
              {/* Detail header */}
              <div style={{ padding: 20, background: "#0f172a", color: "white", position: "relative", flexShrink: 0 }}>
                <button
                  onClick={() => { setSelectedEmpId(null); setDetailData(null) }}
                  style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.1)", border: "none", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <X size={16} />
                </button>

                {(() => {
                  const emp = employees.find((e) => e.employee_id === selectedEmpId)
                  const cfg = getStatus(emp?.status)
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, overflow: "hidden", border: `3px solid ${cfg.color}` }}>
                          {emp?.clock_in_photo
                            ? <img src={emp.clock_in_photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                            : <div style={{ width: "100%", height: "100%", background: `${cfg.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: cfg.color }}>{emp?.employee_name?.charAt(0)}</div>
                          }
                        </div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 900 }}>{emp?.employee_name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color }} />
                            <span style={{ fontSize: 11, fontWeight: 800, color: cfg.color, textTransform: "uppercase" }}>{cfg.label}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Worked Today</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399", marginTop: 2 }}>{fmtDuration(emp?.worked_seconds)}</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Clocked In</div>
                          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{fmtTime(emp?.clock_in)}</div>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {loadingDetail ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                    <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#5d5fef" }} />
                  </div>
                ) : detailData ? (
                  <>
                    {/* Location */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <MapPin size={13} style={{ color: "#5d5fef" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>{detailData.job_site_name}</span>
                      {detailData.clock_in_address && (
                        <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detailData.clock_in_address}</span>
                      )}
                    </div>

                    {/* Timeline */}
                    <div style={{ fontSize: 10, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Timeline</div>
                    <div style={{ position: "relative", paddingLeft: 24 }}>
                      <div style={{ position: "absolute", left: 7, top: 4, bottom: 4, width: 2, background: "var(--stroke2)" }} />

                      <TimelineEvent color="#059669" label="Shift Started" time={detailData.clock_in} sub={detailData.clock_in_address} />

                      {(detailData.history || []).slice(-10).map((ping, i) => (
                        <TimelineEvent key={i} color="#5d5fef" label="GPS Ping" time={ping.timestamp} small />
                      ))}

                      <TimelineEvent
                        color={detailData.clock_out ? "#94a3b8" : "#5d5fef"}
                        label={detailData.clock_out ? "Clocked Out" : "Active"}
                        time={detailData.clock_out || "Live"}
                        pulse={!detailData.clock_out}
                      />
                    </div>

                    {/* Photos */}
                    {detailData.photos?.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 20, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                          <Paperclip size={12} /> Attachments
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                          {detailData.photos.map((p) => (
                            <div key={p.id} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1.5px solid var(--stroke)", cursor: "zoom-in" }}>
                              <img src={p.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : null}
              </div>

              {/* Assign task footer */}
              <div style={{ padding: 12, borderTop: "1px solid var(--stroke)", display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const emp = employees.find((e) => e.employee_id === selectedEmpId)
                    setAssignTarget(emp)
                  }}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 10, background: "#5d5fef", color: "white", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  Assign Task
                </button>
                <button
                  onClick={() => { setSelectedEmpId(null); setDetailData(null) }}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--stroke)", background: "transparent", color: "var(--fg)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ETA Modal ─────────────────────────────────────────────────── */}
      {showETA && (
        <Modal title="ETA Prediction" onClose={() => { setShowETA(false); setEtaResults(null) }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              Enter a target location to see how long each employee will take to arrive.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                placeholder="Target Latitude"
                value={etaTarget.lat}
                onChange={(e) => setEtaTarget((v) => ({ ...v, lat: e.target.value }))}
                style={inputStyle}
              />
              <input
                placeholder="Target Longitude"
                value={etaTarget.lng}
                onChange={(e) => setEtaTarget((v) => ({ ...v, lng: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <button onClick={fetchETA} disabled={loadingETA} style={primaryBtnStyle}>
              {loadingETA ? "Calculating…" : "Calculate ETA"}
            </button>
            {etaResults && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {etaResults.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No clocked-in employees found.</p>
                ) : etaResults.map((r, i) => (
                  <div key={r.employee_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: i === 0 ? "#f0fdf4" : "var(--bg)", border: `1px solid ${i === 0 ? "#bbf7d0" : "var(--stroke)"}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: i === 0 ? "#059669" : "#5d5fef", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--fg)" }}>{r.employee_name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{Math.round(r.distance_meters)}m away</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: i === 0 ? "#059669" : "var(--fg)" }}>{r.eta_minutes} min</div>
                      {r.stale && <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>Stale GPS</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Task Assignment Modal ─────────────────────────────────────── */}
      {assignTarget && (
        <Modal
          title={`Assign Task → ${assignTarget.employee_name}`}
          onClose={() => setAssignTarget(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingTasks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No pending tasks.</p>
            ) : pendingTasks.slice(0, 20).map((task) => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--surface)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--fg)" }}>{task.title}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {task.priority?.toUpperCase()} · {task.location || task.job_address || "No location"}
                  </div>
                </div>
                <button
                  onClick={() => assignTask(task.id, assignTarget.employee_id)}
                  style={{ padding: "5px 14px", borderRadius: 8, background: "#5d5fef", color: "white", border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                >
                  Assign
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        .leaflet-popup-content-wrapper { border-radius:14px !important; box-shadow:0 8px 32px rgba(0,0,0,.12) !important }
        .leaflet-popup-tip { display:none !important }
      `}</style>
    </div>
  )
}

// ── Helper sub-components ─────────────────────────────────────────────────

function TimelineEvent({ color, label, time, sub, small, pulse }) {
  return (
    <div style={{ position: "relative", paddingBottom: small ? 8 : 14 }}>
      <div style={{
        position: "absolute", left: -20, top: 2,
        width: small ? 10 : 14, height: small ? 10 : 14,
        borderRadius: "50%", background: "var(--surface)",
        border: `2.5px solid ${color}`,
        boxShadow: pulse ? `0 0 0 4px ${color}33` : "none",
        animation: pulse ? "pulse 1.5s infinite" : "none",
      }} />
      <div style={{ fontSize: small ? 11 : 12, fontWeight: small ? 600 : 800, color: "var(--fg)" }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
        {typeof time === "string" && time !== "Live" ? fmtTime(time) : time}
        {sub && <span style={{ marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeUp 0.2s ease",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--surface)", borderRadius: 18, padding: 24, width: 480, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--fg)" }}>{title}</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--stroke)", background: "transparent", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────
const inputStyle = {
  padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--stroke)",
  background: "var(--bg)", color: "var(--fg)", fontSize: 13, fontWeight: 600,
  outline: "none", width: "100%", boxSizing: "border-box",
}

const primaryBtnStyle = {
  padding: "10px 0", borderRadius: 10, background: "#5d5fef", color: "white",
  border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer", width: "100%",
}
