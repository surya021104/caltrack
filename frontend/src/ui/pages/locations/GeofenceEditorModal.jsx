/**
 * GeofenceEditorModal.jsx  (Phase 4)
 *
 * Polygon-drawing modal for an existing Location. Wraps the existing
 * DrawableMap.jsx component in draw mode and PATCHes the resulting
 * GeoJSON polygon back to the backend.
 *
 * Backend contract (Phase 1+2):
 *   PATCH /api/time/locations/{id}/  with body
 *     { geofence_type: "polygon", geofence_polygon: <GeoJSON Polygon> }
 *   Server validates the polygon via geo.validators before save.
 *   On 400, the response body has the validation error in `geofence_polygon`.
 *
 * Props:
 *   location  — the saved Location object (must have id, lat, lng, name)
 *   onClose() — caller closes the modal
 *   onSaved(updatedLocation) — caller updates its local state
 */
import React, { useState } from "react"
import { X, Save, Loader2, MapPin, AlertTriangle, Trash2 } from "lucide-react"
import { DrawableMap } from "./DrawableMap.jsx"
import { apiRequest } from "../../../api/client.js"

export function GeofenceEditorModal({ location, onClose, onSaved }) {
  const [drawn, setDrawn] = useState(null)        // GeoJSON geometry from leaflet-draw
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  if (!location) return null

  const handleDrawComplete = (geometry) => {
    setDrawn(geometry)
    setError("")
  }

  const handleDrawDelete = () => {
    setDrawn(null)
  }

  const handleSave = async () => {
    if (!drawn) {
      setError("Draw a polygon on the map first.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const updated = await apiRequest(`/time/locations/${location.id}/`, {
        method: "PATCH",
        json: {
          geofence_type: "polygon",
          geofence_polygon: drawn,
        },
      })
      onSaved?.(updated)
      onClose?.()
    } catch (err) {
      // Server-side validators return {geofence_polygon: "..."} on bad shapes.
      const polyErr = err?.body?.geofence_polygon
      const detail  = err?.body?.detail
      const msg = polyErr || detail || "Failed to save geofence."
      setError(typeof msg === "string" ? msg : JSON.stringify(msg))
    } finally {
      setSaving(false)
    }
  }

  const handleRevertToCircle = async () => {
    if (!window.confirm("Switch this site back to a circle geofence? The polygon will be cleared.")) return
    setSaving(true)
    setError("")
    try {
      const updated = await apiRequest(`/time/locations/${location.id}/`, {
        method: "PATCH",
        json: {
          geofence_type: "circle",
          geofence_polygon: null,
        },
      })
      onSaved?.(updated)
      onClose?.()
    } catch (err) {
      setError(err?.body?.detail || "Failed to revert geofence.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        background: "rgba(15,23,42,0.6)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        style={{
          width: "min(1100px, 96vw)", height: "min(80vh, 720px)",
          background: "white", borderRadius: 24,
          boxShadow: "0 30px 70px -10px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header ────────────────────────────────────────────────── */}
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "#eef2ff", color: "#4F46E5",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MapPin size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: "#94a3b8",
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              Draw Polygon Geofence
            </div>
            <div style={{
              fontSize: 18, fontWeight: 800, color: "#0f172a",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {location.name}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              width: 36, height: 36, borderRadius: 10, border: "1px solid #e2e8f0",
              background: "white", cursor: "pointer", color: "#64748b",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Map ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <DrawableMap
            locations={[location]}
            selectedLocationId={location.id}
            newLat={location.lat}
            newLng={location.lng}
            geofenceType="polygon"
            drawMode={true}
            onDrawComplete={handleDrawComplete}
            onDrawDelete={handleDrawDelete}
            center={[location.lat, location.lng]}
            zoom={16}
            height="100%"
          />
          {/* Draw-state hint overlay */}
          <div style={{
            position: "absolute", top: 16, left: 16, zIndex: 1000,
            background: drawn ? "#ecfdf5" : "#eef2ff",
            color: drawn ? "#065f46" : "#3730a3",
            border: `1px solid ${drawn ? "#a7f3d0" : "#c7d2fe"}`,
            borderRadius: 10, padding: "10px 14px",
            fontSize: 12, fontWeight: 700,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            maxWidth: 320,
          }}>
            {drawn
              ? "Polygon captured. Click Save to apply."
              : "Use the polygon tool (top-right of map) to draw your geofence."}
          </div>
        </div>

        {/* Footer ──────────────────────────────────────────────── */}
        {error && (
          <div style={{
            padding: "10px 24px", background: "#fef2f2",
            color: "#991b1b", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
            borderTop: "1px solid #fecaca",
          }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", gap: 12,
          background: "#f8fafc",
        }}>
          {location.geofence_polygon && (
            <button
              onClick={handleRevertToCircle}
              disabled={saving}
              style={{
                padding: "10px 16px", borderRadius: 10,
                border: "1px solid #fecaca", background: "white",
                color: "#dc2626", fontWeight: 700, fontSize: 13,
                cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Trash2 size={14} /> Revert to circle
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 18px", borderRadius: 10,
              border: "1px solid #e2e8f0", background: "white",
              color: "#475569", fontWeight: 700, fontSize: 13,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !drawn}
            style={{
              padding: "10px 22px", borderRadius: 10, border: "none",
              background: drawn ? "#4F46E5" : "#cbd5e1",
              color: "white", fontWeight: 800, fontSize: 13,
              cursor: (saving || !drawn) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: drawn ? "0 4px 12px rgba(79,70,229,0.3)" : "none",
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving…" : "Save geofence"}
          </button>
        </div>
      </div>
    </div>
  )
}
