/**
 * MapOverview.jsx
 *
 * Admin-only live operational map overview.
 *
 * Phase 4: Marker clustering (imperative L.markerClusterGroup) so the
 * dashboard scales to thousands of sites. Status colours read directly
 * from the Phase 3 backend `status` field instead of being re-derived
 * client-side, so the source of truth is the engine in policies.py.
 *
 * Status colours (matches LocationOverviewView taxonomy):
 *   active      → green   (running clean)
 *   alert       → red     (any open geofence violation)
 *   overcrowded → amber   (on_site > capacity)
 *   inactive    → gray
 *
 * Refreshes every 60 seconds for live employee-on-site counts.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react"
import { MapContainer, TileLayer, useMap, Circle, Polygon, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
// Phase 4: cluster plugin. Loaded only on this page.
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import "leaflet.markercluster"
import { RefreshCw, Users, MapPin, AlertTriangle, Activity, X, Clock, ShieldAlert } from "lucide-react"
import { apiRequest, unwrapResults } from "../../../api/client.js"

// ── Status → colour mapping (single source of truth, Phase 3 contract) ───────
const STATUS_COLOURS = {
  active:      "#22C55E", // green
  alert:       "#EF4444", // red
  overcrowded: "#F59E0B", // amber
  inactive:    "#94A3B8", // gray
}

function markerColor(loc) {
  // Prefer Phase 3 `status` field; fall back to legacy heuristic so old
  // backend versions still render (defensive — no breaking change).
  if (loc.status && STATUS_COLOURS[loc.status]) return STATUS_COLOURS[loc.status]
  if (!loc.is_active)            return STATUS_COLOURS.inactive
  if (loc.violation_count > 0)   return STATUS_COLOURS.alert
  if (loc.on_site_count > 0)     return "#F97316" // legacy orange
  if (loc.employee_count === 0)  return STATUS_COLOURS.alert
  return STATUS_COLOURS.active
}

function markerLabel(loc) {
  switch (loc.status) {
    case "alert":       return "Alert"
    case "overcrowded": return "Overcrowded"
    case "inactive":    return "Inactive"
    case "active":      return loc.on_site_count > 0 ? `${loc.on_site_count} on site` : "Active"
    default:
      if (!loc.is_active)              return "Inactive"
      if (loc.on_site_count > 0)       return `${loc.on_site_count} on site`
      if (loc.employee_count === 0)    return "No assignments"
      return "Active"
  }
}

// ── Imperative marker layer w/ clustering (Phase 4) ──────────────────────────
function OverviewMarkers({ locations, onSelect }) {
  const map = useMap()

  useEffect(() => {
    // Cluster group for markers — geofence shapes are NOT clustered (would
    // visually disappear at low zoom). Shapes go straight onto the map.
    const cluster = L.markerClusterGroup({
      // Keep clustering aggressive at low zoom; un-cluster as you zoom in.
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 15,
      maxClusterRadius: 60,
      iconCreateFunction: (c) => {
        const count = c.getChildCount()
        // Aggregate child statuses to colour the cluster bubble.
        let color = STATUS_COLOURS.active
        for (const m of c.getAllChildMarkers()) {
          const s = m.options._status
          if (s === "alert")             { color = STATUS_COLOURS.alert; break }
          if (s === "overcrowded")       color = STATUS_COLOURS.overcrowded
          else if (s === "inactive" && color === STATUS_COLOURS.active) color = STATUS_COLOURS.inactive
        }
        const size = count < 10 ? 36 : count < 50 ? 44 : 52
        return L.divIcon({
          className: "",
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${color};color:white;border:3px solid rgba(255,255,255,0.9);
            box-shadow:0 4px 12px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
            font-weight:800;font-size:13px;">${count}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })
      },
    })

    const shapeLayers = [] // geofence polygons/circles, drawn outside cluster

    locations.forEach((loc) => {
      const color = markerColor(loc)
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          position:relative;
          width:36px;height:36px;
          background:${color};
          border:3px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 4px 12px rgba(0,0,0,0.25);
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="width:10px;height:10px;background:white;border-radius:50%;transform:rotate(45deg)"></div>
          ${loc.on_site_count > 0 ? `<div style="
            position:absolute;top:-6px;right:-6px;transform:rotate(45deg);
            background:#1e1b4b;color:white;font-size:9px;font-weight:800;
            min-width:16px;height:16px;border-radius:99px;
            display:flex;align-items:center;justify-content:center;padding:0 3px;
          ">${loc.on_site_count}</div>` : ""}
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -38],
      })

      const onSiteHtml = loc.on_site_employees?.length
        ? `<div style="margin-top:8px">
            <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px">ON SITE NOW</div>
            ${loc.on_site_employees.slice(0,5).map(n => `
              <div style="font-size:12px;color:#1e293b;padding:2px 0">${n}</div>
            `).join("")}
            ${loc.on_site_employees.length > 5 ? `<div style="font-size:11px;color:#94a3b8">+${loc.on_site_employees.length - 5} more</div>` : ""}
           </div>`
        : ""

      // Phase 3 enrichment: surface violations & late arrivals in popup.
      const violations = loc.violation_count || 0
      const late = loc.late_arrival_count || 0
      const alertHtml = (violations > 0 || late > 0)
        ? `<div style="margin-top:8px;padding:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
            <div style="font-size:11px;font-weight:700;color:#b91c1c;margin-bottom:4px">ALERTS</div>
            ${violations > 0 ? `<div style="font-size:12px;color:#991b1b">${violations} geofence violation${violations === 1 ? "" : "s"}</div>` : ""}
            ${late > 0      ? `<div style="font-size:12px;color:#991b1b">${late} late arrival${late === 1 ? "" : "s"}</div>` : ""}
           </div>`
        : ""

      const marker = L.marker([loc.lat, loc.lng], { icon, _status: loc.status })
        .bindPopup(`
          <div style="min-width:220px;font-family:system-ui,sans-serif;padding:2px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
              <div style="font-weight:800;font-size:14px;color:#0f172a">${loc.name}</div>
            </div>
            <div style="font-size:12px;color:#64748b;margin-bottom:8px">${loc.address || "No address"}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div style="background:#f8fafc;padding:6px 8px;border-radius:6px">
                <div style="font-size:10px;color:#94a3b8;font-weight:600">ASSIGNED</div>
                <div style="font-size:16px;font-weight:800;color:#0f172a">${loc.employee_count}</div>
              </div>
              <div style="background:#f8fafc;padding:6px 8px;border-radius:6px">
                <div style="font-size:10px;color:#94a3b8;font-weight:600">ON SITE</div>
                <div style="font-size:16px;font-weight:800;color:${color}">${loc.on_site_count}</div>
              </div>
            </div>
            ${alertHtml}
            ${onSiteHtml}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;text-transform:capitalize">
              ${loc.location_type?.replace("_", " ") || "Location"} · ${markerLabel(loc)}
            </div>
          </div>
        `, { maxWidth: 260 })
        .on("click", () => onSelect?.(loc))

      cluster.addLayer(marker)

      // Draw geofence (shapes go straight onto the map, NOT into cluster).
      if (loc.geofence_polygon) {
        try {
          const geom = typeof loc.geofence_polygon === "string"
            ? JSON.parse(loc.geofence_polygon)
            : loc.geofence_polygon
          const ring = geom.coordinates?.[0]
          if (ring) {
            const positions = ring.map(([lng, lat]) => [lat, lng])
            const poly = L.polygon(positions, {
              color, fillColor: color, fillOpacity: 0.08, weight: 1.5
            }).addTo(map)
            shapeLayers.push(poly)
          }
        } catch { /* skip */ }
      } else {
        const circle = L.circle([loc.lat, loc.lng], {
          radius: loc.geofence_radius || 300,
          color, fillColor: color, fillOpacity: 0.06, weight: 1
        }).addTo(map)
        shapeLayers.push(circle)
      }
    })

    map.addLayer(cluster)

    return () => {
      map.removeLayer(cluster)
      shapeLayers.forEach((s) => s.remove())
    }
  }, [map, locations, onSelect])

  return null
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ locations }) {
  const total    = locations.length
  const active   = locations.filter(l => l.is_active).length
  const onSite   = locations.reduce((s, l) => s + (l.on_site_count || 0), 0)
  // Phase 4: alerts come from the Phase 3 status field, not a heuristic.
  const alerts   = locations.filter(l => (l.status === "alert") || (l.violation_count || 0) > 0).length

  const stat = (icon, label, val, color) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 16px", background: "var(--surface)",
      borderRadius: 10, border: "1px solid var(--stroke)", flex: 1,
    }}>
      <div style={{ color, opacity: 0.8 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)", lineHeight: 1 }}>{val}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )

  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--stroke)" }}>
      {stat(<MapPin size={18} />, "Total Sites", total, "#4F46E5")}
      {stat(<Activity size={18} />, "Active", active, "#22C55E")}
      {stat(<Users size={18} />, "On Site Now", onSite, "#F97316")}
      {stat(<AlertTriangle size={18} />, "Alerts", alerts, "#EF4444")}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: STATUS_COLOURS.active,      label: "Active — running clean" },
    { color: STATUS_COLOURS.alert,       label: "Alert — geofence violation" },
    { color: STATUS_COLOURS.overcrowded, label: "Overcrowded — over capacity" },
    { color: STATUS_COLOURS.inactive,    label: "Inactive" },
  ]
  return (
    <div style={{
      position: "absolute", bottom: 16, left: 16, zIndex: 1000,
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
      borderRadius: 10, padding: "10px 14px", border: "1px solid var(--stroke)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Phase 6: Sticky alerts banner ────────────────────────────────────────────
function AlertsBanner({ locations, onShowAlerts, onShowOvercrowded }) {
  const totals = useMemo(() => {
    let violations = 0, lates = 0, alertSites = 0, overcrowdedSites = 0
    for (const l of locations) {
      violations += l.violation_count || 0
      lates      += l.late_arrival_count || 0
      if (l.status === "alert")       alertSites++
      if (l.status === "overcrowded") overcrowdedSites++
    }
    return { violations, lates, alertSites, overcrowdedSites }
  }, [locations])

  const hasAnything = totals.violations > 0 || totals.lates > 0 || totals.overcrowdedSites > 0
  if (!hasAnything) return null

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "12px 16px",
      background: totals.violations > 0 ? "#fef2f2" : "#fffbeb",
      borderBottom: `1px solid ${totals.violations > 0 ? "#fecaca" : "#fde68a"}`,
      flexWrap: "wrap",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: totals.violations > 0 ? "#fee2e2" : "#fef3c7",
        color: totals.violations > 0 ? "#b91c1c" : "#a16207",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <AlertTriangle size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 800,
          color: totals.violations > 0 ? "#991b1b" : "#92400e",
        }}>
          {totals.violations > 0 && (
            <span>{totals.violations} open geofence violation{totals.violations === 1 ? "" : "s"} </span>
          )}
          {totals.violations > 0 && totals.lates > 0 && <span>· </span>}
          {totals.lates > 0 && (
            <span>{totals.lates} late arrival{totals.lates === 1 ? "" : "s"} </span>
          )}
          {(totals.violations > 0 || totals.lates > 0) && totals.overcrowdedSites > 0 && <span>· </span>}
          {totals.overcrowdedSites > 0 && (
            <span>{totals.overcrowdedSites} overcrowded site{totals.overcrowdedSites === 1 ? "" : "s"}</span>
          )}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: totals.violations > 0 ? "#991b1b" : "#92400e",
          opacity: 0.75, marginTop: 2,
        }}>
          across {totals.alertSites + totals.overcrowdedSites} affected site{totals.alertSites + totals.overcrowdedSites === 1 ? "" : "s"}
        </div>
      </div>
      {totals.alertSites > 0 && (
        <button
          onClick={onShowAlerts}
          style={{
            padding: "8px 14px", borderRadius: 10, border: "none",
            background: "#dc2626", color: "white",
            fontSize: 12, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <ShieldAlert size={13} /> Show alerts
        </button>
      )}
      {totals.overcrowdedSites > 0 && (
        <button
          onClick={onShowOvercrowded}
          style={{
            padding: "8px 14px", borderRadius: 10, border: "none",
            background: "#d97706", color: "white",
            fontSize: 12, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Users size={13} /> Show overcrowded
        </button>
      )}
    </div>
  )
}


// ── Phase 6: Location detail side panel ──────────────────────────────────────
// Slides in from the right when a marker is clicked. Fetches today's open
// time logs at that location and highlights violations / late arrivals.
function LocationDetailPanel({ location, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }, [])

  useEffect(() => {
    if (!location) return
    let cancelled = false
    setLoading(true); setError("")
    ;(async () => {
      try {
        // Admin-scoped: returns all logs for the company. Filter client-side
        // to this location + open shifts to keep payloads small enough.
        const res = await apiRequest(`/time/logs/?date_from=${today}`)
        const all = unwrapResults(res) || []
        if (cancelled) return
        const filtered = all.filter((l) =>
          String(l.location) === String(location.id) && !l.clock_out
        )
        setLogs(filtered)
      } catch (e) {
        if (!cancelled) setError("Failed to load shifts at this site.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [location, today])

  if (!location) return null

  const formatTime = (iso) => {
    if (!iso) return "—"
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } catch { return "—" }
  }

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: "min(420px, 100%)", zIndex: 1500,
      background: "white", boxShadow: "-8px 0 30px rgba(0,0,0,0.15)",
      display: "flex", flexDirection: "column",
      animation: "slide-in-right 220ms ease-out",
    }}>
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: STATUS_COLOURS[location.status] || STATUS_COLOURS.active,
          color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <MapPin size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
            {location.name}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {location.location_type?.replace("_", " ") || "Site"} · {markerLabel(location)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0",
            background: "white", cursor: "pointer", color: "#64748b",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Counters */}
      <div style={{
        padding: "12px 20px", display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
      }}>
        {[
          { label: "On site",     val: location.on_site_count || 0,        color: STATUS_COLOURS.active },
          { label: "Violations",  val: location.violation_count || 0,      color: STATUS_COLOURS.alert },
          { label: "Late",        val: location.late_arrival_count || 0,   color: STATUS_COLOURS.overcrowded },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: "#f8fafc", borderRadius: 10, padding: "8px 10px",
          }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 800, letterSpacing: "0.05em" }}>
              {label.toUpperCase()}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* Open shifts list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 20px" }}>
        <div style={{
          fontSize: 10, color: "#94a3b8", fontWeight: 800,
          letterSpacing: "0.1em", marginTop: 8, marginBottom: 8,
        }}>
          OPEN SHIFTS · TODAY
        </div>
        {loading && (
          <div style={{ fontSize: 12, color: "#64748b", padding: "20px 0", textAlign: "center" }}>
            Loading shifts…
          </div>
        )}
        {error && (
          <div style={{
            fontSize: 12, color: "#991b1b",
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 8, padding: "10px 12px",
          }}>
            {error}
          </div>
        )}
        {!loading && !error && logs.length === 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8", padding: "20px 0", textAlign: "center" }}>
            No employees clocked in here right now.
          </div>
        )}
        {!loading && !error && logs.map((log) => {
          const isViolation = !log.geofence_passed && !log.admin_override_used
          const tone = isViolation ? "alert" : "ok"
          const bg = isViolation ? "#fef2f2" : "#f8fafc"
          const border = isViolation ? "#fecaca" : "#e2e8f0"
          return (
            <div key={log.id} style={{
              border: `1px solid ${border}`, background: bg,
              borderRadius: 10, padding: "10px 12px", marginBottom: 8,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: tone === "alert" ? "#fee2e2" : "#e0e7ff",
                color: tone === "alert" ? "#991b1b" : "#3730a3",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 11, flexShrink: 0,
              }}>
                {(log.employee_name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#0f172a",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {log.employee_name || log.employee_username || "Unknown"}
                </div>
                <div style={{
                  fontSize: 11, color: "#64748b", marginTop: 2,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <Clock size={10} /> Since {formatTime(log.clock_in)}
                  {log.distance_from_site_meters != null && (
                    <span> · {log.distance_from_site_meters < 1000
                      ? `${log.distance_from_site_meters}m off`
                      : `${(log.distance_from_site_meters/1000).toFixed(1)}km off`
                    }</span>
                  )}
                </div>
              </div>
              {isViolation && (
                <div style={{
                  fontSize: 10, fontWeight: 800,
                  color: "#991b1b", background: "white",
                  border: "1px solid #fecaca",
                  padding: "3px 8px", borderRadius: 99,
                  letterSpacing: "0.05em",
                }}>
                  VIOLATION
                </div>
              )}
              {log.admin_override_used && (
                <div style={{
                  fontSize: 10, fontWeight: 800,
                  color: "#1e40af", background: "white",
                  border: "1px solid #bfdbfe",
                  padding: "3px 8px", borderRadius: 99,
                  letterSpacing: "0.05em",
                }}>
                  OVERRIDE
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ── Main component ────────────────────────────────────────────────────────────
export function MapOverview() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selected, setSelected]   = useState(null)
  const [filterZone, setFilterZone] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const load = useCallback(async () => {
    try {
      const data = await apiRequest("/time/locations/overview/")
      setLocations(Array.isArray(data) ? data : [])
      setLastUpdated(new Date())
    } catch {
      setLocations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000) // refresh every 30s (matches backend cache window)
    return () => clearInterval(interval)
  }, [load])

  // Phase 4: filters now read the Phase 3 `status` field (with legacy fallback).
  const filtered = locations.filter((loc) => {
    const status = loc.status || (loc.is_active ? "active" : "inactive")
    if (filterStatus === "active"      && status !== "active") return false
    if (filterStatus === "inactive"    && status !== "inactive") return false
    if (filterStatus === "onsite"      && (loc.on_site_count || 0) === 0) return false
    if (filterStatus === "alerts"      && status !== "alert") return false
    if (filterStatus === "overcrowded" && status !== "overcrowded") return false
    return true
  })

  const mapCenter = filtered.length > 0
    ? [filtered[0].lat, filtered[0].lng]
    : [20.5937, 78.9629]

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Stats */}
      <StatsBar locations={locations} />

      {/* Phase 6 — Sticky alerts banner. Hidden when there's nothing wrong. */}
      <AlertsBanner
        locations={locations}
        onShowAlerts={() => setFilterStatus("alerts")}
        onShowOvercrowded={() => setFilterStatus("overcrowded")}
      />

      {/* Filter bar */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 16px", alignItems: "center",
        borderBottom: "1px solid var(--stroke)", flexWrap: "wrap",
      }}>
        {[
          { val: "all",         label: "All Sites" },
          { val: "active",      label: "Active" },
          { val: "onsite",      label: "On Site" },
          { val: "alerts",      label: "Alerts" },
          { val: "overcrowded", label: "Overcrowded" },
          { val: "inactive",    label: "Inactive" },
        ].map(({ val, label }) => (
          <button key={val} onClick={() => setFilterStatus(val)}
            style={{
              padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--stroke)", cursor: "pointer",
              background: filterStatus === val ? "#4F46E5" : "transparent",
              color: filterStatus === val ? "#fff" : "var(--fg2)",
            }}>
            {label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={load} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 8,
            border: "1px solid var(--stroke)", background: "transparent",
            fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--fg2)",
          }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loading ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Loading overview…</div>
            </div>
          </div>
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={filtered.length === 1 ? 14 : 5}
            style={{ width: "100%", height: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <OverviewMarkers locations={filtered} onSelect={setSelected} />
            <Legend />
          </MapContainer>
        )}

        {/* Phase 6 — Detail panel slides in over the map when a marker is clicked */}
        {selected && (
          <LocationDetailPanel
            location={locations.find((l) => l.id === selected.id) || selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
