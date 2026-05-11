"""
Celery periodic tasks for live tracking.

Register in Django admin → Periodic Tasks (django-celery-beat) or via
CELERY_BEAT_SCHEDULE in settings.

Recommended schedule:
  check_missed_clock_ins   — every 15 minutes
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import math


def _haversine_meters(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@shared_task(name="live_locations.check_missed_clock_ins")
def check_missed_clock_ins():
    """
    Runs every 15 minutes.

    For each company tenant:
      1. Find shifts that started in the last 15 minutes.
      2. Check whether the assigned employee has an active TimeLog.
      3. If no clock-in but the employee has a recent GPS ping near the
         shift location → log a 'potential missed clock-in' warning.
      4. Optionally push a WebSocket alert to the admin group.
    """
    from django_tenants.utils import schema_context
    from companies.models import Company

    now = timezone.now()
    window_start = now - timedelta(minutes=15)
    flagged = []

    for company in Company.objects.filter(is_active=True):
        try:
            with schema_context(company.schema_name):
                flagged.extend(_check_company(company, now, window_start))
        except Exception as exc:
            print(f"[Celery] check_missed_clock_ins failed for {company.schema_name}: {exc}")

    return {"flagged": flagged}


def _check_company(company, now, window_start):
    from scheduling.models import Shift
    from time_tracking.models import TimeLog
    from live_locations.models import EmployeeLocation

    flagged = []

    # Shifts that should have started in the last 15 min
    recent_shifts = (
        Shift.objects.filter(
            shift_start__gte=window_start,
            shift_start__lte=now,
            company=company,
        )
        .select_related("employee", "employee__user", "location")
    )

    for shift in recent_shifts:
        employee = shift.employee

        # Already clocked in?
        if TimeLog.objects.filter(
            employee=employee,
            clock_in__gte=window_start,
            clock_out__isnull=True,
        ).exists():
            continue  # Fine – they've clocked in

        # Do they have a recent GPS ping near the shift location?
        recent_ping = (
            EmployeeLocation.objects.filter(employee=employee, timestamp__gte=window_start)
            .order_by("-timestamp")
            .first()
        )

        if not recent_ping:
            continue  # No GPS data – can't confirm they're on site

        # Only flag if they're within 2× the geofence radius of the location
        if shift.location:
            radius = getattr(shift.location, "geofence_radius", None) or 300
            dist = _haversine_meters(
                float(recent_ping.lat), float(recent_ping.lng),
                float(shift.location.lat), float(shift.location.lng),
            )
            if dist > radius * 2:
                continue  # They're not near the location, probably AWOL

        emp_name = employee.user.get_full_name() or employee.user.username
        flag = {
            "employee_id": str(employee.id),
            "employee_name": emp_name,
            "shift_id": str(shift.id),
            "shift_start": shift.shift_start.isoformat(),
            "location": shift.location.name if shift.location else "Unknown",
        }
        flagged.append(flag)

        # Push WebSocket alert to admins
        _push_missed_clockin_alert(company, flag)

    return flagged


def _push_missed_clockin_alert(company, flag):
    """Push a missed-clock-in alert to the company's admin WS group."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        async_to_sync(channel_layer.group_send)(
            f"live_admin_{company.id}",
            {
                "type": "employee_sos",  # Reuse SOS handler on frontend (shows as warning)
                "data": {
                    **flag,
                    "alert_type": "missed_clock_in",
                    "timestamp": timezone.now().isoformat(),
                    "status": "warning",
                },
            },
        )
    except Exception as exc:
        print(f"[Celery] _push_missed_clockin_alert error: {exc}")
