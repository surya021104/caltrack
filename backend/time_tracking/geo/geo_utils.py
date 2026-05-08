"""
time_tracking.geo.geo_utils
───────────────────────────
Pure-Python geographic primitives. No Django imports. Trivially unit-testable.
"""
from __future__ import annotations

import math
from typing import Iterable, Sequence, Tuple

# Earth radius (mean) in metres — same constant used by the legacy
# time_tracking/utils.py:calculate_distance helper.
EARTH_RADIUS_M = 6_371_000


# ─────────────────────────────────────────────────────────────────────────────
# Distance
# ─────────────────────────────────────────────────────────────────────────────
def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """Great-circle distance between two GPS points in metres (rounded int).

    Accurate to ±1m for distances under 10km. Mirrors the legacy
    calculate_distance() helper byte-for-byte so refactor introduces no drift.
    """
    lat1_r, lng1_r, lat2_r, lng2_r = map(
        math.radians, (float(lat1), float(lng1), float(lat2), float(lng2))
    )
    dlat = lat2_r - lat1_r
    dlng = lng2_r - lng1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return round(c * EARTH_RADIUS_M)


# ─────────────────────────────────────────────────────────────────────────────
# Point in polygon (ray-casting, GeoJSON convention)
# ─────────────────────────────────────────────────────────────────────────────
def point_in_ring(lat: float, lng: float, ring: Sequence[Sequence[float]]) -> bool:
    """Returns True if (lat, lng) lies inside the GeoJSON ring.

    GeoJSON rings are arrays of [lng, lat] pairs; the outer ring is
    counter-clockwise; the first and last points are equal (closed).

    Implementation: ray-casting (Jordan-curve theorem). Stable for
    rings up to ~10k vertices; sub-millisecond at typical sizes (<200).
    """
    if not ring or len(ring) < 4:
        return False

    inside = False
    x = float(lng)  # GeoJSON convention: x = lng
    y = float(lat)  # y = lat
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        # Standard ray-casting test: count edges crossing the horizontal
        # ray to the right of (x, y).
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_polygon(lat: float, lng: float, geometry: dict) -> bool:
    """Point-in-polygon for a GeoJSON ``Polygon`` geometry.

    A point is inside iff it is inside the outer ring AND outside every
    hole (inner ring). Handles malformed input by returning False.
    """
    if not isinstance(geometry, dict):
        return False
    if geometry.get("type") != "Polygon":
        return False
    rings = geometry.get("coordinates")
    if not isinstance(rings, list) or not rings:
        return False
    outer = rings[0]
    if not point_in_ring(lat, lng, outer):
        return False
    # Holes: must NOT be inside any of them.
    for hole in rings[1:]:
        if point_in_ring(lat, lng, hole):
            return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Bounding box (used as a quick reject before ray-casting)
# ─────────────────────────────────────────────────────────────────────────────
def ring_bbox(ring: Sequence[Sequence[float]]) -> Tuple[float, float, float, float]:
    """Returns (min_lng, min_lat, max_lng, max_lat) for a GeoJSON ring."""
    if not ring:
        return (0.0, 0.0, 0.0, 0.0)
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return (min(lngs), min(lats), max(lngs), max(lats))


def point_in_bbox(lat: float, lng: float, bbox: Tuple[float, float, float, float]) -> bool:
    min_lng, min_lat, max_lng, max_lat = bbox
    return (min_lat <= lat <= max_lat) and (min_lng <= lng <= max_lng)


# ─────────────────────────────────────────────────────────────────────────────
# Polygon centroid (approximation — fine for "distance to centre" UX)
# ─────────────────────────────────────────────────────────────────────────────
def ring_centroid(ring: Sequence[Sequence[float]]) -> Tuple[float, float]:
    """Returns (lat, lng) centroid of a GeoJSON ring (average of vertices)."""
    if not ring:
        return (0.0, 0.0)
    n = len(ring)
    lat = sum(float(p[1]) for p in ring) / n
    lng = sum(float(p[0]) for p in ring) / n
    return (lat, lng)


# ─────────────────────────────────────────────────────────────────────────────
# Distance from a point to the nearest edge of a ring (metres)
# ─────────────────────────────────────────────────────────────────────────────
def distance_to_ring_m(lat: float, lng: float, ring: Sequence[Sequence[float]]) -> int:
    """Approximate distance in metres from (lat, lng) to the closest edge.

    For each segment we compute the closest point in lat/lng space, then
    measure with Haversine. Acceptable for geofences <10km in diameter.
    """
    if not ring or len(ring) < 2:
        return haversine_m(lat, lng, lat, lng)
    best = float("inf")
    for i in range(len(ring) - 1):
        x1, y1 = float(ring[i][0]), float(ring[i][1])
        x2, y2 = float(ring[i + 1][0]), float(ring[i + 1][1])
        clat, clng = _closest_point_on_segment(lat, lng, y1, x1, y2, x2)
        d = haversine_m(lat, lng, clat, clng)
        if d < best:
            best = d
    return int(best) if best != float("inf") else 0


def _closest_point_on_segment(
    plat: float, plng: float, alat: float, alng: float, blat: float, blng: float
) -> Tuple[float, float]:
    """Closest point on segment AB to point P, in lat/lng space.

    Treats lat/lng as Cartesian. Inaccurate near the poles or for very
    long segments but well within tolerance for sub-10km geofences.
    """
    ax, ay = alng, alat
    bx, by = blng, blat
    px, py = plng, plat
    abx, aby = bx - ax, by - ay
    if abx == 0 and aby == 0:
        return (alat, alng)
    t = ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)
    t = max(0.0, min(1.0, t))
    return (ay + t * aby, ax + t * abx)


# ─────────────────────────────────────────────────────────────────────────────
# Segment-pair intersection (used by polygon self-intersection check)
# ─────────────────────────────────────────────────────────────────────────────
def segments_intersect(
    a: Sequence[float], b: Sequence[float], c: Sequence[float], d: Sequence[float]
) -> bool:
    """Returns True if segment AB properly crosses segment CD.

    Endpoint-touching is intentionally NOT counted as an intersection so
    that consecutive polygon edges (which share a vertex) don't trip the
    self-intersection detector.
    """
    def ccw(p, q, r):
        return (r[1] - p[1]) * (q[0] - p[0]) > (q[1] - p[1]) * (r[0] - p[0])

    # Reject shared endpoints — they're not crossings.
    if a == c or a == d or b == c or b == d:
        return False
    return ccw(a, c, d) != ccw(b, c, d) and ccw(a, b, c) != ccw(a, b, d)


def ring_self_intersects(ring: Sequence[Sequence[float]]) -> bool:
    """O(n²) self-intersection sweep. Fine for n < 200; rejected at validate()
    if larger via a hard cap. Used as a polygon-integrity gate before storage.
    """
    n = len(ring) - 1  # closing duplicate
    if n < 4:
        return False
    for i in range(n):
        a = ring[i]
        b = ring[i + 1]
        for j in range(i + 1, n):
            # Skip adjacent edges (share endpoint) and the wrap-around pair.
            if j == i or j == i + 1:
                continue
            if i == 0 and j == n - 1:
                continue
            c = ring[j]
            d = ring[j + 1]
            if segments_intersect(a, b, c, d):
                return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Helpers used by service
# ─────────────────────────────────────────────────────────────────────────────
def parse_polygon(raw) -> dict | None:
    """Coerces stored polygon (dict or JSON string) into a dict.
    Returns None for empty/malformed input.
    """
    if raw is None or raw == "":
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            import json
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except (ValueError, TypeError):
            return None
    return None
