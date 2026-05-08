"""
time_tracking.policies
──────────────────────
Resolves enforcement modes for geofence and shift-location decisions.

A "mode" is one of: 'block' | 'warn' | 'off'.

Two distinct decisions, two distinct configs:
  - GEOFENCE mismatch  (employee outside the matched location's circle/polygon)
      → company.geofence_strict_mode (bool)  + company.geofence_admin_override
        Mapped to: True → 'block'; False → 'warn'.

  - SHIFT-LOCATION mismatch  (employee at the wrong site for their shift)
      → shift.enforcement_override → company.shift_enforcement_mode
        Inheritance chain: 'inherit' on shift falls back to company.

Keeping mode resolution in a single module means the geofence_service
and any future job/CLI/admin override path use the same logic.
"""
from __future__ import annotations

from dataclasses import dataclass

# Mode values ────────────────────────────────────────────────────────────────
MODE_BLOCK = "block"
MODE_WARN = "warn"
MODE_OFF = "off"

ALL_MODES = (MODE_BLOCK, MODE_WARN, MODE_OFF)


@dataclass(frozen=True)
class ModeResolution:
    """Result of resolving a mode for a given decision class."""
    mode: str
    source: str  # e.g. 'company.geofence_strict_mode' or 'shift.enforcement_override'

    @property
    def blocks(self) -> bool:
        return self.mode == MODE_BLOCK

    @property
    def warns(self) -> bool:
        return self.mode == MODE_WARN

    @property
    def is_off(self) -> bool:
        return self.mode == MODE_OFF


# ─────────────────────────────────────────────────────────────────────────────
# Geofence mode (circle/polygon mismatch)
# ─────────────────────────────────────────────────────────────────────────────
def resolve_geofence_mode(company) -> ModeResolution:
    """Maps the legacy boolean strict_mode to a tri-state mode.

    True (strict)  → block
    False (lenient)→ warn

    'off' is reachable only via geofence_enabled=False — handled at a
    higher level by the service short-circuiting before this is called.
    """
    if company is None:
        return ModeResolution(mode=MODE_WARN, source="default-no-company")
    if getattr(company, "geofence_strict_mode", False):
        return ModeResolution(mode=MODE_BLOCK, source="company.geofence_strict_mode=True")
    return ModeResolution(mode=MODE_WARN, source="company.geofence_strict_mode=False")


# ─────────────────────────────────────────────────────────────────────────────
# Shift-location mode (wrong site for current shift)
# ─────────────────────────────────────────────────────────────────────────────
def resolve_shift_mode(company, shift) -> ModeResolution:
    """Resolves the mode for shift–location mismatches.

    Per-shift override wins if it's not 'inherit'. Otherwise we read the
    company-level default added in Phase 1.
    """
    # Per-shift override (Phase 1: scheduling.Shift.enforcement_override).
    shift_mode = getattr(shift, "enforcement_override", None) if shift else None
    if shift_mode and shift_mode != "inherit":
        return ModeResolution(mode=shift_mode, source="shift.enforcement_override")

    # Company default (Phase 1: companies.Company.shift_enforcement_mode).
    company_mode = getattr(company, "shift_enforcement_mode", None) if company else None
    if company_mode in ALL_MODES:
        return ModeResolution(mode=company_mode, source="company.shift_enforcement_mode")

    # Fall back to warn — matches the field default and is the safest no-op.
    return ModeResolution(mode=MODE_WARN, source="default-warn")


# ─────────────────────────────────────────────────────────────────────────────
# Admin override eligibility
# ─────────────────────────────────────────────────────────────────────────────
def admin_override_allowed(company, *, is_admin: bool, requested: bool) -> bool:
    """Returns True iff admin-override should bypass a geofence block.

    Caller must pass `requested=True` to opt in. The flag is kept explicit
    so we don't silently override on every admin clock-in.
    """
    if not requested:
        return False
    if not is_admin:
        return False
    if company is None:
        return False
    return bool(getattr(company, "geofence_admin_override", False))
