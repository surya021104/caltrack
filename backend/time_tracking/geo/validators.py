"""
time_tracking.geo.validators
────────────────────────────
GeoJSON polygon integrity gate. Used by serializers and the API extension
endpoints to reject malformed input BEFORE it reaches the database.

Public surface:
    validate_geojson_polygon(geometry) -> dict
        Raises ValidationError on any failure; returns the (possibly
        normalised) geometry dict on success.
"""
from __future__ import annotations

from typing import Any

from rest_framework.exceptions import ValidationError

from . import geo_utils

# Hard caps to prevent abuse / accidental DoS.
MAX_RINGS = 8                  # outer + up to 7 holes
MAX_VERTICES_PER_RING = 200    # ray-casting is O(n) per check; self-intersect O(n²)
MIN_VERTICES_PER_RING = 4      # 3 distinct + closing duplicate


def validate_geojson_polygon(geometry: Any) -> dict:
    """Validate a GeoJSON Polygon. Returns the validated dict on success.

    Rules enforced:
      1. type == "Polygon"
      2. coordinates is a list of rings (1..MAX_RINGS)
      3. each ring has between MIN_VERTICES_PER_RING and MAX_VERTICES_PER_RING points
      4. each ring is closed (first point == last point)
      5. each coordinate is [lng, lat] with sane numeric values
      6. -180 <= lng <= 180, -90 <= lat <= 90
      7. outer ring does not self-intersect
    """
    if not isinstance(geometry, dict):
        raise ValidationError({"geofence_polygon": "Polygon must be a JSON object."})

    gtype = geometry.get("type")
    if gtype != "Polygon":
        raise ValidationError({"geofence_polygon": f"type must be 'Polygon', got {gtype!r}."})

    rings = geometry.get("coordinates")
    if not isinstance(rings, list) or not rings:
        raise ValidationError({"geofence_polygon": "coordinates must be a non-empty list of rings."})

    if len(rings) > MAX_RINGS:
        raise ValidationError({"geofence_polygon": f"polygon may have at most {MAX_RINGS} rings."})

    for ring_index, ring in enumerate(rings):
        _validate_ring(ring, ring_index)

    # Self-intersection only checked on the outer ring; holes are typically
    # convex and the cost is negligible at MAX_VERTICES_PER_RING anyway.
    outer = rings[0]
    if geo_utils.ring_self_intersects(outer):
        raise ValidationError({"geofence_polygon": "outer ring is self-intersecting."})

    return geometry


def _validate_ring(ring: Any, ring_index: int) -> None:
    label = "outer ring" if ring_index == 0 else f"hole #{ring_index}"

    if not isinstance(ring, list):
        raise ValidationError({"geofence_polygon": f"{label} must be a list of [lng, lat] pairs."})

    if len(ring) < MIN_VERTICES_PER_RING:
        raise ValidationError({
            "geofence_polygon": f"{label} must have at least {MIN_VERTICES_PER_RING} points (3 distinct + closing duplicate).",
        })
    if len(ring) > MAX_VERTICES_PER_RING:
        raise ValidationError({
            "geofence_polygon": f"{label} exceeds the {MAX_VERTICES_PER_RING}-vertex cap.",
        })

    # Each point must be [lng, lat] with finite numbers in valid ranges.
    for i, point in enumerate(ring):
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise ValidationError({
                "geofence_polygon": f"{label} point {i} must be [lng, lat].",
            })
        try:
            lng = float(point[0])
            lat = float(point[1])
        except (TypeError, ValueError):
            raise ValidationError({
                "geofence_polygon": f"{label} point {i} contains non-numeric coordinates.",
            })
        if not (-180.0 <= lng <= 180.0):
            raise ValidationError({
                "geofence_polygon": f"{label} point {i}: longitude {lng} out of range.",
            })
        if not (-90.0 <= lat <= 90.0):
            raise ValidationError({
                "geofence_polygon": f"{label} point {i}: latitude {lat} out of range.",
            })

    # Closed-ring check: first point equals last point (within float epsilon).
    first = ring[0]
    last = ring[-1]
    if abs(float(first[0]) - float(last[0])) > 1e-9 or abs(float(first[1]) - float(last[1])) > 1e-9:
        raise ValidationError({
            "geofence_polygon": f"{label} must be closed (first point must equal last point).",
        })


# ─────────────────────────────────────────────────────────────────────────────
# Coordinate sanity (used by validate-point endpoint in Phase 3)
# ─────────────────────────────────────────────────────────────────────────────
def validate_lat_lng(lat: Any, lng: Any) -> tuple[float, float]:
    """Coerce + range-check a (lat, lng) pair. Raises ValidationError on bad input."""
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        raise ValidationError({"detail": "lat and lng must be numbers."})
    if not (-90.0 <= lat_f <= 90.0):
        raise ValidationError({"lat": f"latitude {lat_f} out of range."})
    if not (-180.0 <= lng_f <= 180.0):
        raise ValidationError({"lng": f"longitude {lng_f} out of range."})
    return (lat_f, lng_f)
