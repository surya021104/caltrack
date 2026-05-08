"""
time_tracking.geo
─────────────────
Reusable geofence engine for CALTRACK.

Public API:
    from time_tracking.geo import evaluate, Decision
    from time_tracking.geo.validators import validate_geojson_polygon

Internal modules:
    geo_utils        — pure-math primitives (haversine, ray-casting, etc.)
    validators       — GeoJSON polygon shape & integrity checks
    geofence_service — single evaluate() entry point used by views/jobs

Backend interface is intentionally swappable. The default backend uses
pure-Python primitives; a future PostGIS backend can implement the same
evaluate() signature using ST_DWithin and ST_Contains without touching callers.
"""
from .geofence_service import Decision, evaluate, TenantMismatch  # noqa: F401
