"""
time_tracking.geo.geofence_service
──────────────────────────────────
Single decisioning entry point for every geofence/clock-in path.

Public surface:
    Decision        — typed result (allowed, location, distance, reason, mode, ...)
    TenantMismatch  — raised when employee.company != caller's company
    evaluate(...)   — the function

Reasons (Decision.reason):
    geofence_disabled        — company.geofence_enabled == False
    no_gps_provided          — caller did not pass lat/lng; falls through to legacy logic
    no_assigned_locations    — employee has no permitted locations and no JobSite fallback
    inside_circle            — within the matched location's radius
    inside_polygon           — point in polygon for the matched location
    inside_hybrid            — inside circle OR polygon (hybrid mode)
    outside_circle           — outside radius
    outside_polygon          — outside polygon
    shift_location_mismatch  — employee is on a shift requiring a specific location
                               but is not inside that location's geofence
    admin_override           — geofence missed but admin override absorbed it

Modes: 'block' | 'warn' | 'off'  (see time_tracking.policies)

This module is intentionally Django-aware (employee/location are model
instances) but holds no view-layer knowledge. ClockInView and any future
admin job both call evaluate() and consume the Decision identically.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

from . import geo_utils
from .. import policies

# Reason codes ───────────────────────────────────────────────────────────────
REASON_GEOFENCE_DISABLED = "geofence_disabled"
REASON_NO_GPS = "no_gps_provided"
REASON_NO_ASSIGNED = "no_assigned_locations"
REASON_INSIDE_CIRCLE = "inside_circle"
REASON_INSIDE_POLYGON = "inside_polygon"
REASON_INSIDE_HYBRID = "inside_hybrid"
REASON_OUTSIDE_CIRCLE = "outside_circle"
REASON_OUTSIDE_POLYGON = "outside_polygon"
REASON_SHIFT_MISMATCH = "shift_location_mismatch"
REASON_ADMIN_OVERRIDE = "admin_override"


class TenantMismatch(Exception):
    """Raised when an employee's company doesn't match the caller's company."""


@dataclass
class Decision:
    """Result of a single geofence evaluation."""
    allowed: bool
    reason: str
    mode: str                       # 'block' | 'warn' | 'off' (see policies)
    matched_location: Optional[object] = None  # time_tracking.Location
    distance_m: Optional[int] = None           # to matched location centre/edge
    geofence_passed: bool = False              # for TimeLog.geofence_passed
    admin_override_used: bool = False          # for TimeLog.admin_override_used
    # Optional metadata the caller might want to include in responses/logs.
    radius_m: Optional[int] = None
    candidate_count: int = 0
    shift: Optional[object] = None

    # ── Response shaping helpers (preserve back-compat with legacy view) ──
    def to_block_response(self) -> dict:
        """Builds the 403 body the legacy ClockInView used to return.

        Format MUST stay identical so existing frontends (TimePage, mobile)
        keep parsing distance/radius from the same keys.
        """
        if self.distance_m is not None:
            dist_km = round(self.distance_m / 1000, 1)
            if self.reason == REASON_SHIFT_MISMATCH:
                msg = (
                    f"You are {dist_km} km from the location required by your "
                    f"current shift. Move to the assigned site to clock in."
                )
            else:
                msg = (
                    f"You are {dist_km} km from the nearest authorized site. "
                    f"Move closer."
                )
        else:
            msg = "You are not within an authorized clock-in location."
        return {
            "success": False,
            "message": msg,
            "distance": self.distance_m,
            "radius": self.radius_m,
            # New field — old clients ignore it; new clients use it for UX.
            "reason": self.reason,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────
def evaluate(
    *,
    employee,
    company,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    candidate_locations: Optional[Iterable[object]] = None,
    shift: Optional[object] = None,
    is_admin: bool = False,
    request_admin_override: bool = False,
) -> Decision:
    """Resolve a single clock-in decision.

    Parameters mirror the architecture doc precedence list. The caller
    chooses how to assemble candidate_locations; if None, this function
    does the legacy resolution (allow_all → shift → employee assignments).

    Returns a Decision; never raises except for TenantMismatch.
    """
    # ── Tenant safety guard ──────────────────────────────────────────────
    emp_company_id = getattr(getattr(employee, "company", None), "id", None)
    caller_company_id = getattr(company, "id", None)
    if emp_company_id is not None and caller_company_id is not None and emp_company_id != caller_company_id:
        raise TenantMismatch(
            f"employee.company={emp_company_id} != caller.company={caller_company_id}"
        )

    # ── Geofence globally disabled? Allow with mode=off ──────────────────
    if company is not None and not getattr(company, "geofence_enabled", True):
        return Decision(
            allowed=True,
            reason=REASON_GEOFENCE_DISABLED,
            mode=policies.MODE_OFF,
            geofence_passed=True,
        )

    # ── Resolve candidate locations ──────────────────────────────────────
    candidates, used_jobsite = _resolve_candidates(employee, shift, candidate_locations)

    # ── Mode resolution (used by both shift and geofence paths) ──────────
    geofence_mode = policies.resolve_geofence_mode(company)
    shift_mode = policies.resolve_shift_mode(company, shift)

    # ── Admin override eligibility ───────────────────────────────────────
    admin_can_override = policies.admin_override_allowed(
        company, is_admin=is_admin, requested=request_admin_override or is_admin,
    )

    # ── No GPS supplied? Mirror legacy behaviour: passed=True, no distance ──
    if lat is None or lng is None:
        # Legacy view set passed=True silently and stored no distance.
        # Surface a primary-or-first match if we have any candidates.
        primary = _primary_or_first(candidates)
        return Decision(
            allowed=True,
            reason=REASON_NO_GPS,
            mode=geofence_mode.mode,
            matched_location=primary,
            distance_m=None,
            geofence_passed=True,
            candidate_count=len(candidates),
            shift=shift,
        )

    # ── No candidates at all ─────────────────────────────────────────────
    if not candidates:
        # Legacy: if no permitted_locations and no JobSite, the geofence
        # block is never entered, so passed=True is preserved.
        return Decision(
            allowed=True,
            reason=REASON_NO_ASSIGNED,
            mode=policies.MODE_OFF,
            matched_location=None,
            distance_m=None,
            geofence_passed=True,
            candidate_count=0,
            shift=shift,
        )

    # ── Score every candidate; pick the best ─────────────────────────────
    best = _best_match(float(lat), float(lng), candidates)
    matched, distance, inside_circle_b, inside_polygon_b, geo_type, radius = best

    # ── Determine inside / outside ───────────────────────────────────────
    inside = False
    inside_reason = REASON_OUTSIDE_CIRCLE
    if geo_type == "polygon":
        inside = inside_polygon_b
        inside_reason = REASON_INSIDE_POLYGON if inside else REASON_OUTSIDE_POLYGON
    elif geo_type == "hybrid":
        inside = inside_polygon_b or inside_circle_b
        inside_reason = REASON_INSIDE_HYBRID if inside else REASON_OUTSIDE_CIRCLE
    else:
        # 'circle' or any unknown value falls through to circle semantics
        # (matches legacy view). Used for JobSite fallback too.
        inside = inside_circle_b
        inside_reason = REASON_INSIDE_CIRCLE if inside else REASON_OUTSIDE_CIRCLE

    # ── Shift mismatch check (Phase 2 NEW) ───────────────────────────────
    # If a shift requires a specific location and the matched candidate is a
    # different location (or we matched but are outside its geofence), the
    # SHIFT mode determines the outcome separately from the geofence mode.
    shift_required_loc = getattr(shift, "location", None) if shift is not None else None
    if shift_required_loc is not None:
        shift_loc_id = getattr(shift_required_loc, "id", None)
        matched_id = getattr(matched, "id", None)
        if shift_loc_id is not None and matched_id != shift_loc_id:
            # Wrong site entirely.
            return _resolve_outcome(
                allowed_default=False,
                reason=REASON_SHIFT_MISMATCH,
                mode_resolution=shift_mode,
                matched=shift_required_loc,
                distance=_distance_to_location(float(lat), float(lng), shift_required_loc),
                radius=getattr(shift_required_loc, "geofence_radius", None) or 300,
                candidate_count=len(candidates),
                admin_can_override=admin_can_override,
                shift=shift,
            )

    # ── Geofence outcome ─────────────────────────────────────────────────
    if inside:
        return Decision(
            allowed=True,
            reason=inside_reason,
            mode=geofence_mode.mode,
            matched_location=matched,
            distance_m=distance,
            geofence_passed=True,
            radius_m=radius,
            candidate_count=len(candidates),
            shift=shift,
        )

    # Outside — apply geofence mode (block / warn / off).
    return _resolve_outcome(
        allowed_default=False,
        reason=inside_reason,
        mode_resolution=geofence_mode,
        matched=matched,
        distance=distance,
        radius=radius,
        candidate_count=len(candidates),
        admin_can_override=admin_can_override,
        shift=shift,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────
def _resolve_candidates(employee, shift, override):
    """Returns (candidates, used_jobsite_fallback).

    Precedence:
      1. Caller passed candidate_locations explicitly → use those.
      2. shift.location set → constrain to that one site.
      3. employee.allow_all_locations → all active company locations.
      4. EmployeeLocation.permitted_locations.
      5. Legacy JobSite (employee.assigned_job_site) wrapped as a Location-like.
    """
    if override is not None:
        items = list(override)
        return (items, False)

    # 2. Shift filter.
    shift_loc = getattr(shift, "location", None) if shift is not None else None
    if shift_loc is not None:
        return ([shift_loc], False)

    # 3. allow_all_locations override.
    if getattr(employee, "allow_all_locations", False):
        from time_tracking.models import Location  # local import — avoid cycle
        company = getattr(employee, "company", None)
        qs = Location.objects.all()
        if company is not None:
            qs = qs.filter(company=company)
        qs = qs.filter(is_active=True, is_archived=False)
        return (list(qs), False)

    # 4. Per-employee permitted locations.
    permitted_qs = (
        getattr(employee, "permitted_locations", None)
        and employee.permitted_locations.select_related("location").all()
    )
    if permitted_qs:
        locs = [el.location for el in permitted_qs if getattr(el.location, "is_active", True)]
        if locs:
            return (locs, False)

    # 5. Legacy JobSite fallback — wrapped to look like a Location for the
    #    rest of the engine. Only circle semantics apply.
    job_site = getattr(employee, "assigned_job_site", None)
    if job_site is not None:
        return ([_JobSiteLocationAdapter(job_site)], True)

    return ([], False)


def _primary_or_first(candidates: Sequence[object]):
    """Returns the primary location (if EmployeeLocation flagged is_primary)
    or the first candidate. Used only when GPS isn't supplied."""
    if not candidates:
        return None
    # The candidates list is plain Locations at this point; the is_primary
    # flag lives on EmployeeLocation. Re-derive primary via attribute lookup
    # only when the candidate carries the hint.
    for c in candidates:
        if getattr(c, "_is_primary", False):
            return c
    return candidates[0]


def _best_match(lat: float, lng: float, candidates: Sequence[object]):
    """For each candidate, compute (distance, inside_circle, inside_polygon)
    and return the winner.

    Winner rule (matches legacy view + extends with polygon-aware logic):
      1. Any candidate whose geofence the point is inside takes priority
         over outside-only candidates.
      2. Among inside candidates, pick the smallest distance to centre.
      3. If none are inside, pick the smallest distance to the nearest
         (centre) — same as legacy.
    Returns: (matched, distance_m, inside_circle, inside_polygon, geofence_type, radius)
    """
    best_inside = None
    best_outside = None
    best_inside_dist = float("inf")
    best_outside_dist = float("inf")

    for loc in candidates:
        loc_lat = float(getattr(loc, "lat"))
        loc_lng = float(getattr(loc, "lng"))
        radius = int(getattr(loc, "geofence_radius", 300) or 300)
        geo_type = getattr(loc, "geofence_type", "circle") or "circle"

        d = geo_utils.haversine_m(lat, lng, loc_lat, loc_lng)

        in_circle = d <= radius
        in_polygon = False
        polygon_geom = geo_utils.parse_polygon(getattr(loc, "geofence_polygon", None))
        if polygon_geom is not None:
            in_polygon = geo_utils.point_in_polygon(lat, lng, polygon_geom)

        if geo_type == "polygon":
            inside = in_polygon
        elif geo_type == "hybrid":
            inside = in_polygon or in_circle
        else:
            inside = in_circle

        record = (loc, d, in_circle, in_polygon, geo_type, radius)
        if inside and d < best_inside_dist:
            best_inside, best_inside_dist = record, d
        if not inside and d < best_outside_dist:
            best_outside, best_outside_dist = record, d

    return best_inside or best_outside or (candidates[0], 0, False, False, "circle", 300)


def _distance_to_location(lat: float, lng: float, location) -> int:
    """Distance to a location's centre in metres (used for shift-mismatch UX)."""
    return geo_utils.haversine_m(lat, lng, float(location.lat), float(location.lng))


def _resolve_outcome(
    *, allowed_default: bool, reason: str, mode_resolution: policies.ModeResolution,
    matched, distance, radius, candidate_count, admin_can_override, shift,
) -> Decision:
    """Combines mode resolution + admin override into a final Decision."""
    # 'off' mode: the legacy view treated False strict_mode as "warn-only";
    # we honour that here. Allowed=True, geofence_passed=False.
    if mode_resolution.is_off or mode_resolution.warns:
        return Decision(
            allowed=True,
            reason=reason,
            mode=mode_resolution.mode,
            matched_location=matched,
            distance_m=distance,
            geofence_passed=False,
            radius_m=radius,
            candidate_count=candidate_count,
            shift=shift,
        )

    # Strict block — admin override takes precedence if eligible.
    if admin_can_override:
        return Decision(
            allowed=True,
            reason=REASON_ADMIN_OVERRIDE,
            mode=mode_resolution.mode,
            matched_location=matched,
            distance_m=distance,
            geofence_passed=True,  # legacy: passed flipped True under override
            admin_override_used=True,
            radius_m=radius,
            candidate_count=candidate_count,
            shift=shift,
        )

    return Decision(
        allowed=False,
        reason=reason,
        mode=mode_resolution.mode,
        matched_location=matched,
        distance_m=distance,
        geofence_passed=False,
        radius_m=radius,
        candidate_count=candidate_count,
        shift=shift,
    )


# ─────────────────────────────────────────────────────────────────────────────
# JobSite adapter — lets the legacy JobSite participate in the new engine
# ─────────────────────────────────────────────────────────────────────────────
class _JobSiteLocationAdapter:
    """Wraps a time_tracking.JobSite so the engine can treat it like a Location.

    Only circle semantics — JobSite has no geofence_polygon.
    """
    def __init__(self, job_site):
        self._js = job_site
        self.id = getattr(job_site, "id", None)
        self.lat = job_site.lat
        self.lng = job_site.lng
        # Fall back to company default if the JobSite doesn't override.
        self.geofence_radius = (
            getattr(job_site, "geofence_radius", None)
            or getattr(getattr(job_site, "company", None), "geofence_radius_meters", None)
            or 300
        )
        self.geofence_polygon = None
        self.geofence_type = "circle"
        self.is_active = True

    @property
    def name(self):
        return getattr(self._js, "name", "Job Site")
