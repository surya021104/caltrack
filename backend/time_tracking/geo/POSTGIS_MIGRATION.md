# PostGIS Migration Plan — CALTRACK Geofence Engine

This document describes how to migrate the CALTRACK geofence engine from the
default pure-Python backend (Haversine + ray-casting) to PostGIS spatial
operators (`ST_DWithin`, `ST_Contains`, `ST_GeomFromGeoJSON`). It is a
deferred deliverable from Phase 7 of the Geolocation & Multi-Site Management
architecture and is intentionally not executed in the current code path.

The pure-Python backend is sub-millisecond per location at the typical scale
(≤50 candidate locations per employee, ≤200 vertices per polygon). PostGIS
becomes worth the migration cost when:

* a tenant exceeds ~500 polygon-typed locations
* polygon containment query latency exceeds 50 ms p95
* spatial reporting features need range queries (e.g. "which sites overlap
  this rectangle on the map?")

---

## 1. Prerequisites

PostgreSQL with the PostGIS extension installed in every tenant schema.
Supabase supports this on paid tiers; check with the Caltrack DBA before
beginning.

```sql
-- Run once per tenant schema (django-tenants applies this via SHARED_APPS or
-- via a custom management command).
CREATE EXTENSION IF NOT EXISTS postgis;
```

`django.contrib.gis` is added to `SHARED_APPS` in `quicktims/settings.py`
and the database engine is changed:

```python
DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",       # current
        # ↓ becomes
        "ENGINE": "django.contrib.gis.db.backends.postgis",  # via custom router
    }
}
```

`django-tenants` does not ship a PostGIS-aware backend out of the box; a
custom backend that extends `django_tenants.postgresql_backend` and mixes
in PostGIS operations is required. There is a community recipe for this
that is well-known but not on PyPI; a 30-line custom file does the job.

---

## 2. Model changes

`time_tracking.Location` gains GIS fields alongside the existing JSONB
geometry. Both stay in sync via signals so callers can flip between the two
backends without data loss.

```python
from django.contrib.gis.db import models as gis_models

class Location(models.Model):
    # ... existing fields unchanged ...

    # GIS counterparts. Populated by a signal whenever lat/lng/polygon change.
    centroid = gis_models.PointField(geography=True, null=True, blank=True)
    polygon  = gis_models.PolygonField(geography=True, null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "is_archived"], name="loc_company_archived_idx"),
            gis_models.Index(fields=["centroid"], name="loc_centroid_gist", opclasses=["gist"]),
            gis_models.Index(fields=["polygon"],  name="loc_polygon_gist",  opclasses=["gist"]),
        ]
```

---

## 3. Data backfill

Run once per tenant after the schema migration:

```sql
UPDATE time_tracking_location
   SET centroid = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
 WHERE centroid IS NULL;

UPDATE time_tracking_location
   SET polygon = ST_GeomFromGeoJSON(geofence_polygon::text)::geography
 WHERE geofence_polygon IS NOT NULL
   AND polygon IS NULL;
```

The geofence_polygon JSONB stays in place as a portable representation; the
PostGIS columns mirror it for query performance.

---

## 4. Engine swap (zero caller changes)

The Phase 2 architecture made `time_tracking.geo.geofence_service.evaluate()`
the single entry point for every clock-in path. Switching backends means
adding a new module and toggling a constant — no view, serializer, or test
needs to change.

```python
# time_tracking/geo/postgis_backend.py  (new file)
from django.contrib.gis.geos import Point
from django.contrib.gis.db.models.functions import Distance
from time_tracking.models import Location

def find_inside_locations(lat, lng, candidate_qs):
    """Returns Locations where the point is inside circle OR polygon.

    Replaces the per-row Python loop with a single SQL query using
    ST_DWithin (circle) and ST_Contains (polygon).
    """
    point = Point(lng, lat, srid=4326)
    return candidate_qs.annotate(
        dist=Distance("centroid", point),
    ).filter(
        models.Q(geofence_type="polygon", polygon__contains=point) |
        models.Q(geofence_type="circle",  centroid__dwithin=(point, F("geofence_radius"))) |
        models.Q(geofence_type="hybrid",  polygon__contains=point) |
        models.Q(geofence_type="hybrid",  centroid__dwithin=(point, F("geofence_radius")))
    )
```

`geofence_service.evaluate()` then calls this helper instead of looping
through candidates with `geo_utils.haversine_m` and `point_in_polygon`. A
feature flag at the company level (e.g. `Company.geofence_backend`) lets
tenants opt into PostGIS individually for staged rollout.

---

## 5. Verification

1. The 36 engine tests in `tests/test_geofence_engine.py` (Phase 2)
   continue to pass. Both backends must produce identical Decision values
   for every fixture.
2. New benchmark: insert 1000 polygon locations with 100-vertex rings.
   With pure-Python: expect ~50 ms per evaluate(). With PostGIS:
   expect <5 ms.
3. Cross-tenant safety: `find_inside_locations()` is always passed a
   queryset already filtered by `company=request.company`. Schema
   isolation via django-tenants still applies.

---

## 6. Rollback

PostGIS columns remain populated after rollback. The pure-Python backend
reads `lat`, `lng`, and `geofence_polygon` (JSONB), all of which are
unchanged. A bad PostGIS query plan cannot affect pure-Python callers.

To roll back:

```python
# settings.py
GEOFENCE_BACKEND = "python"  # was "postgis"
```

The PostGIS columns and indexes can be left in place indefinitely.

---

## 7. Out of scope

* Time-windowed geofences (Phase 6 future-extensibility item)
* Hybrid time + space queries (e.g. "who clocked in inside this polygon
  during last week's heatwave alert window?") — these need separate
  TimeLog GIS columns
* WebSocket live-location streaming (Phase 6 candidate)
