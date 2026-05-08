/**
 * geofence.js
 * Client-side geofence validation utilities.
 *
 * Two modes:
 *   1. Circle   — haversine distance vs radius
 *   2. Polygon  — ray-casting point-in-polygon
 *
 * Results: "inside" | "near_boundary" | "outside"
 * Near boundary = within 20% of the geofence edge (useful for UX warnings)
 */

const EARTH_RADIUS_M = 6_371_000 // metres

// ── Haversine distance ────────────────────────────────────────────────────────
/**
 * Returns great-circle distance in metres between two GPS points.
 * Accurate to ±1m for distances < 10km.
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

// ── Ray-casting point-in-polygon ─────────────────────────────────────────────
/**
 * Determines whether a GPS point is inside a GeoJSON Polygon.
 *
 * @param {number} lat - Employee latitude
 * @param {number} lng - Employee longitude
 * @param {number[][]} ring - Array of [lng, lat] pairs (GeoJSON coords)
 * @returns {boolean}
 */
export function pointInPolygon(lat, lng, ring) {
  let inside = false
  const x = lng
  const y = lat
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// ── Main validation entry point ───────────────────────────────────────────────
/**
 * Check whether an employee GPS position is inside a location's geofence.
 *
 * @param {number} empLat  - Employee latitude
 * @param {number} empLng  - Employee longitude
 * @param {object} location - Location object from API
 * @returns {{ result: "inside"|"near_boundary"|"outside", distance: number|null }}
 */
export function checkGeofence(empLat, empLng, location) {
  if (!location) return { result: "outside", distance: null }

  // ── Polygon mode ──────────────────────────────────────────────────────────
  if (location.geofence_polygon) {
    try {
      const geom = typeof location.geofence_polygon === "string"
        ? JSON.parse(location.geofence_polygon)
        : location.geofence_polygon

      // GeoJSON Polygon: coordinates[0] is the outer ring
      const ring = geom.coordinates?.[0]
      if (!Array.isArray(ring)) throw new Error("Invalid polygon")

      const inside = pointInPolygon(empLat, empLng, ring)
      if (inside) return { result: "inside", distance: null }

      // Find distance to nearest polygon edge for "near boundary" logic
      const center = polygonCentroid(ring)
      const dist = haversine(empLat, empLng, center.lat, center.lng)
      return { result: "outside", distance: Math.round(dist) }
    } catch {
      // Corrupt polygon — fall through to circle mode
    }
  }

  // ── Circle mode ───────────────────────────────────────────────────────────
  const radius = location.geofence_radius ?? 300
  const dist = haversine(empLat, empLng, location.lat, location.lng)
  const distRounded = Math.round(dist)

  if (dist <= radius) return { result: "inside", distance: distRounded }
  if (dist <= radius * 1.2) return { result: "near_boundary", distance: distRounded }
  return { result: "outside", distance: distRounded }
}

// ── Check against multiple locations ─────────────────────────────────────────
/**
 * Find the best-matching location from an array.
 * Returns the first "inside" match, or the closest "near_boundary", or null.
 */
export function findMatchingLocation(empLat, empLng, locations) {
  let bestNear = null
  let bestNearDist = Infinity

  for (const loc of locations) {
    if (!loc.is_active) continue
    const { result, distance } = checkGeofence(empLat, empLng, loc)
    if (result === "inside") return { location: loc, result: "inside", distance }
    if (result === "near_boundary" && distance < bestNearDist) {
      bestNear = loc
      bestNearDist = distance
    }
  }

  if (bestNear) return { location: bestNear, result: "near_boundary", distance: bestNearDist }
  return null
}

// ── Shift-aware best location selection (Phase 5) ────────────────────────────
/**
 * Like findMatchingLocation, but if a shift requires a specific location
 * we restrict the candidate set to that one site. Mirrors the backend
 * geofence_service precedence rule.
 *
 * Returns:
 *   { location, result, distance, shiftMatches }
 *     shiftMatches: true if shift.location is set and we matched against it.
 *                   false if shift.location is set but we ended up at a
 *                   different site (i.e. shift_location_mismatch).
 *                   null if no shift constraint.
 */
export function findBestLocation(empLat, empLng, locations, shift = null) {
  const shiftLocId = shift?.location?.id ?? shift?.location_id ?? null

  if (shiftLocId) {
    // Restrict candidates to the shift's required site.
    const required = locations.find((l) => String(l.id) === String(shiftLocId))
    if (required) {
      const { result, distance } = checkGeofence(empLat, empLng, required)
      return {
        location: required,
        result,
        distance,
        shiftMatches: result === "inside",
      }
    }
    // Shift requires a location we don't have client-side; let the server decide.
    return { location: null, result: "outside", distance: null, shiftMatches: false }
  }

  // No shift constraint — fall back to nearest-match logic.
  const match = findMatchingLocation(empLat, empLng, locations)
  if (!match) return { location: null, result: "outside", distance: null, shiftMatches: null }
  return { ...match, shiftMatches: null }
}

// ── Reason-code translation for backend dry-run responses (Phase 5) ──────────
/**
 * Maps the engine's reason code (from POST /time/geofence/validate-point/)
 * to a short human label suitable for inline display. Keep in sync with
 * the constants in time_tracking/geo/geofence_service.py.
 */
export const REASON_LABELS = {
  inside_circle:           "Inside geofence",
  inside_polygon:          "Inside geofence",
  inside_hybrid:           "Inside geofence",
  outside_circle:          "Outside geofence",
  outside_polygon:         "Outside geofence",
  shift_location_mismatch: "Wrong site for shift",
  no_assigned_locations:   "No site assigned",
  no_gps_provided:         "GPS not available",
  geofence_disabled:       "Geofence off",
  admin_override:          "Admin override",
}

export function reasonLabel(reasonCode) {
  return REASON_LABELS[reasonCode] || reasonCode || ""
}

// ── Polygon centroid (approximate) ───────────────────────────────────────────
function polygonCentroid(ring) {
  let lat = 0, lng = 0
  const n = ring.length
  for (const [lo, la] of ring) { lat += la; lng += lo }
  return { lat: lat / n, lng: lng / n }
}

// ── Human-readable distance ───────────────────────────────────────────────────
export function formatDistance(metres) {
  if (metres == null) return ""
  if (metres < 1000) return `${metres}m`
  return `${(metres / 1000).toFixed(1)}km`
}
