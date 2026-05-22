/**
 * DrawableMap.jsx
 *
 * A Leaflet map that supports:
 *  1. Displaying saved locations (circle or polygon geofence)
 *  2. Drawing NEW geofences using leaflet-draw
 *  3. Clicking the map to set coordinates
 *  4. Color-coded markers: green=active, gray=inactive, red=alert
 */
import React, { useEffect, useRef, useCallback } from "react"
import { MapContainer, TileLayer, useMapEvents, useMap, Circle, Polygon, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-draw/dist/leaflet.draw.css"

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  active:   "#22C55E",
  inactive: "#94A3B8",
  alert:    "#EF4444",
}

function statusColor(loc) {
  if (!loc.is_active) return STATUS_COLORS.inactive
  return STATUS_COLORS.active
}

// ── Custom marker factory ─────────────────────────────────────────────────────
function makePin(color, size = 30) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:3px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 3px 10px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
    "><div style="width:8px;height:8px;background:white;border-radius:50%;transform:rotate(45deg)"></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

// ── Map click handler ─────────────────────────────────────────────────────────
function MapClickHandler({ onMapClick, enabled }) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── Leaflet.draw toolbar (imperative) ─────────────────────────────────────────
function DrawControl({ onDrawComplete, onDrawDelete, geofenceType, active }) {
  const map = useMap()
  const featureGroupRef = useRef(null)
  const drawControlRef  = useRef(null)

  useEffect(() => {
    if (!active) return
    // Lazy-load leaflet-draw
    import("leaflet-draw").then(() => {
      if (!featureGroupRef.current) {
        featureGroupRef.current = new L.FeatureGroup()
        map.addLayer(featureGroupRef.current)
      }

      // Remove old control
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current)
        drawControlRef.current = null
      }

      const drawOptions = {
        draw: {
          polyline: false,
          rectangle: geofenceType !== "circle",
          polygon:   geofenceType !== "circle" ? {
            allowIntersection: false,
            showArea: true,
            shapeOptions: { color: "#4F46E5", fillOpacity: 0.15 },
          } : false,
          circle: geofenceType === "circle" ? {
            shapeOptions: { color: "#4F46E5", fillOpacity: 0.15 },
          } : false,
          marker: false,
          circlemarker: false,
        },
        edit: { featureGroup: featureGroupRef.current },
      }

      drawControlRef.current = new L.Control.Draw(drawOptions)
      map.addControl(drawControlRef.current)

      // Draw complete
      const onCreate = (e) => {
        featureGroupRef.current.clearLayers()
        featureGroupRef.current.addLayer(e.layer)
        const geojson = e.layer.toGeoJSON()
        onDrawComplete(geojson.geometry, e.layer)
      }
      map.on(L.Draw.Event.CREATED, onCreate)

      // Delete
      const onDelete = () => {
        featureGroupRef.current.clearLayers()
        onDrawDelete()
      }
      map.on(L.Draw.Event.DELETED, onDelete)

      return () => {
        map.off(L.Draw.Event.CREATED, onCreate)
        map.off(L.Draw.Event.DELETED, onDelete)
        if (drawControlRef.current) {
          map.removeControl(drawControlRef.current)
          drawControlRef.current = null
        }
        if (featureGroupRef.current) {
          map.removeLayer(featureGroupRef.current)
          featureGroupRef.current = null
        }
      }
    })
  }, [map, active, geofenceType, onDrawComplete, onDrawDelete])

  return null
}

// ── Saved location layers ─────────────────────────────────────────────────────
function LocationLayers({ locations, onSelect, selectedId }) {
  return locations.map((loc) => {
    const color = statusColor(loc)
    const isSelected = String(loc.id) === String(selectedId)
    const borderColor = isSelected ? "#F97316" : color

    const marker = (
      <CustomMarker
        key={`m-${loc.id}`}
        loc={loc}
        color={borderColor}
        onSelect={onSelect}
      />
    )

    if (loc.geofence_polygon) {
      try {
        const geom = typeof loc.geofence_polygon === "string"
          ? JSON.parse(loc.geofence_polygon)
          : loc.geofence_polygon
        const ring = geom.coordinates?.[0]
        if (ring) {
          const positions = ring.map(([lng, lat]) => [lat, lng])
          return (
            <React.Fragment key={loc.id}>
              {marker}
              <Polygon
                positions={positions}
                pathOptions={{ color: borderColor, fillColor: color, fillOpacity: 0.12, weight: 2 }}
              >
                <Popup>{loc.name}</Popup>
              </Polygon>
            </React.Fragment>
          )
        }
      } catch { /* invalid polygon — fall through */ }
    }

    return (
      <React.Fragment key={loc.id}>
        {marker}
        <Circle
          center={[loc.lat, loc.lng]}
          radius={loc.geofence_radius || 300}
          pathOptions={{ color: borderColor, fillColor: color, fillOpacity: 0.1, weight: 1.5 }}
        />
      </React.Fragment>
    )
  })
}

// Custom marker (uses imperative L.marker to avoid react-leaflet Marker/Popup issues)
function CustomMarker({ loc, color, onSelect }) {
  const map = useMap()
  const markerRef = useRef(null)

  useEffect(() => {
    const pin = makePin(color)
    const marker = L.marker([loc.lat, loc.lng], { icon: pin })
      .bindPopup(`
        <div style="min-width:160px;font-family:inherit">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${loc.name}</div>
          <div style="font-size:12px;color:#64748b">${loc.address || "No address"}</div>
          <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="font-size:12px;font-weight:600;text-transform:capitalize">${loc.is_active ? "Active" : "Inactive"}</span>
          </div>
          <div style="margin-top:4px;font-size:11px;color:#94a3b8">${loc.employee_count || 0} assigned employees</div>
        </div>
      `)
      .on("click", () => onSelect?.(loc))
    marker.addTo(map)
    markerRef.current = marker
    return () => { marker.remove() }
  }, [map, loc, color, onSelect])

  return null
}

// ── Preview marker + circle while adding ─────────────────────────────────────
function PreviewLayer({ lat, lng, radius, geofenceType }) {
  if (!lat || !lng) return null
  if (geofenceType === "circle") {
    return (
      <Circle
        center={[lat, lng]}
        radius={radius || 300}
        pathOptions={{ color: "#4F46E5", fillColor: "#4F46E5", fillOpacity: 0.12, weight: 2, dashArray: "6 4" }}
      />
    )
  }
  return null
}

// ── FlyTo helper ──────────────────────────────────────────────────────────────
function MapFlyTo({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], 16, { duration: 1 })
  }, [map, lat, lng])
  return null
}

// ── Main exported component ───────────────────────────────────────────────────
export function DrawableMap({
  // Existing saved locations to render
  locations = [],
  selectedLocationId = null,
  onLocationSelect,

  // New location being added
  newLat, newLng, newRadius = 300,
  geofenceType = "circle",        // "circle" | "polygon"
  drawMode = false,                // show the draw toolbar?
  onMapClick,                      // (lat, lng) → void
  onDrawComplete,                  // (geoJsonGeometry) → void
  onDrawDelete,                    // () → void

  // Map options
  center = [20.5937, 78.9629],    // Default: India
  zoom = 5,
  height = "100%",
}) {
  const handleDrawComplete = useCallback((geometry) => {
    onDrawComplete?.(geometry)
  }, [onDrawComplete])

  const handleDrawDelete = useCallback(() => {
    onDrawDelete?.()
  }, [onDrawDelete])

  return (
    <MapContainer
      center={newLat && newLng ? [newLat, newLng] : center}
      zoom={zoom}
      style={{ width: "100%", height }}
      zoomControl={true}
      maxZoom={22}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxNativeZoom={19}
        maxZoom={22}
      />

      {/* Saved location markers + geofence shapes */}
      <LocationLayers
        locations={locations}
        onSelect={onLocationSelect}
        selectedId={selectedLocationId}
      />

      {/* Preview of new location being added */}
      <PreviewLayer lat={newLat} lng={newLng} radius={newRadius} geofenceType={geofenceType} />

      {/* Fly to new location pin */}
      {newLat && newLng && <MapFlyTo lat={newLat} lng={newLng} />}

      {/* Click to set coordinates */}
      <MapClickHandler onMapClick={onMapClick} enabled={drawMode || !!onMapClick} />

      {/* Polygon draw toolbar */}
      <DrawControl
        active={drawMode}
        geofenceType={geofenceType}
        onDrawComplete={handleDrawComplete}
        onDrawDelete={handleDrawDelete}
      />
    </MapContainer>
  )
}
