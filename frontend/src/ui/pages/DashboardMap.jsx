import React, { useEffect, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

function FitBounds({ locations }) {
  const map = useMap()
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 400)
    const t3 = setTimeout(() => {
      map.invalidateSize()
      const valid = locations.filter((l) => l.lat && l.lng)
      if (valid.length === 0) return
      if (valid.length === 1) {
        map.setView([valid[0].lat, valid[0].lng], 13)
        return
      }
      const bounds = L.latLngBounds(valid.map((l) => [l.lat, l.lng]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }, 600)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [locations, map])
  return null
}

function createLocationDotIcon(loc) {
  const clockedIn = loc.clocked_in_now || 0
  const clockedOut = loc.clocked_out_today || 0
  const total = clockedIn + clockedOut
  const employees = loc.employees || 0
  const size = Math.max(36, Math.min(72, employees * 8 + 28))
  const half = size / 2

  let color = "#6366F1"
  let glow  = "rgba(99,102,241,0.35)"
  let pulse = false
  if (clockedIn > 0) {
    color = "#10B981"
    glow  = "rgba(16,185,129,0.35)"
    pulse = true
  } else if (clockedOut > 0) {
    color = "#F43F5E"
    glow  = "rgba(244,63,94,0.25)"
  } else if (employees === 0 && total === 0) {
    color = "#94A3B8"
    glow  = "rgba(148,163,184,0.2)"
  }

  const label = employees > 0 ? employees : (total > 0 ? total : "")

  return L.divIcon({
    className: "bg-transparent border-none",
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half - 4],
    html: `
      <div class="relative" style="width:${size}px; height:${size}px;">
        ${pulse ? `<div class="absolute inset-0 rounded-full animate-ping opacity-60" style="background: ${color};"></div>` : ''}
        <div class="absolute inset-0 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-110 hover:z-[1000] shadow-[0_4px_14px_rgba(0,0,0,0.18)]" style="background: ${color}; box-shadow: 0 0 0 6px ${glow};">
          <span class="text-white font-extrabold text-[13px] drop-shadow-md tracking-[0.02em] pointer-events-none">${label}</span>
        </div>
      </div>
    `,
  })
}

export default function DashboardMap({ locationSummary }) {
  const mapCenter = useMemo(() => {
    const locs = locationSummary.filter((l) => l.lat && l.lng)
    if (locs.length === 0) return [20.5937, 78.9629]
    const avgLat = locs.reduce((s, l) => s + l.lat, 0) / locs.length
    const avgLng = locs.reduce((s, l) => s + l.lng, 0) / locs.length
    return [avgLat, avgLng]
  }, [locationSummary])

  return (
    <MapContainer
      center={mapCenter}
      zoom={11}
      style={{ width: "100%", height: "100%", background: "#F1F5F9" }}
      scrollWheelZoom={true}
      zoomControl={false}
    >
      <FitBounds locations={locationSummary} />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; OSM &copy; CARTO'
      />
      {locationSummary.map((loc) => (
        <Marker
          key={loc.name}
          position={[loc.lat, loc.lng]}
          icon={createLocationDotIcon(loc)}
        >
          <Popup className="anl-locmap-popup" offset={[0, -4]}>
            <div className="p-4">
              <div className="font-bold text-slate-900 text-base mb-1">{loc.name}</div>
              {loc.address && <div className="text-slate-500 text-xs mb-3">{loc.address}</div>}
              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 mb-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-indigo-600 font-bold text-base">{loc.employees || 0}</span>
                  <span className="text-slate-500 text-[10px] font-semibold uppercase">Employees</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-emerald-500 font-bold text-base">{loc.clocked_in_now || 0}</span>
                  <span className="text-slate-500 text-[10px] font-semibold uppercase">Clocked In</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-rose-500 font-bold text-base">{loc.clocked_out_today || 0}</span>
                  <span className="text-slate-500 text-[10px] font-semibold uppercase">Clocked Out</span>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg text-center">{loc.hours}h worked (30d)</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
