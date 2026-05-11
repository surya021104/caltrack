"""
scheduling/views.py

ShiftViewSet with WTR 48-hour compliance enforcement.
When creating or updating a shift for a UK employee who has no active WTR
opt-out, the system checks whether the new shift would push the employee's
17-week rolling average above 48 hours/week and blocks the action if so.
Also enforces the UK 11-hour minimum rest between consecutive shifts.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from employees.models import Employee

from .models import Shift
from .serializers import ShiftSerializer


def _shift_hours(shift_start, shift_end):
    """Shift duration in decimal hours."""
    delta = shift_end - shift_start
    return Decimal(str(round(delta.total_seconds() / 3600, 4)))


def _get_scheduled_weekly_hours(employee, iso_year, iso_week, exclude_shift_id=None):
    """Total scheduled hours for the employee in a given ISO week."""
    total = Decimal("0")
    qs = Shift.objects.filter(employee=employee)
    if exclude_shift_id:
        qs = qs.exclude(pk=exclude_shift_id)
    for shift in qs:
        y, w, _ = shift.shift_start.isocalendar()
        if y == iso_year and w == iso_week:
            total += _shift_hours(shift.shift_start, shift.shift_end)
    return total


def _get_actual_weekly_hours(employee, iso_year, iso_week):
    """Total clocked hours for the employee in a given ISO week."""
    from time_tracking.models import TimeLog
    total = Decimal("0")
    for log in TimeLog.objects.filter(
        employee=employee, work_date__iso_year=iso_year
    ).prefetch_related("breaks"):
        if log.work_date.isocalendar()[1] == iso_week:
            total += Decimal(str(round(log.worked_seconds() / 3600, 4)))
    return total


def _build_17_week_hours_with_new_shift(employee, new_shift_start, new_shift_end, exclude_shift_id=None):
    """
    Returns 17 weekly totals (oldest to newest) including the proposed new shift.
    Uses max(actual, scheduled) per week so we don't double-count.
    """
    today = date.today()
    result = []
    for i in range(16, -1, -1):
        target = today - timedelta(weeks=i)
        y, w, _ = target.isocalendar()
        actual = _get_actual_weekly_hours(employee, y, w)
        scheduled = _get_scheduled_weekly_hours(employee, y, w, exclude_shift_id=exclude_shift_id)
        ny, nw, _ = new_shift_start.isocalendar()
        extra = _shift_hours(new_shift_start, new_shift_end) if (ny == y and nw == w) else Decimal("0")
        result.append(float(max(actual, scheduled) + extra))
    return result


def _check_wtr_opt_out(employee):
    """Returns True if the employee has an active WTR 48-hr opt-out."""
    try:
        from compliance.models import WTROptOut
        return WTROptOut.objects.filter(employee=employee, is_active=True).exists()
    except Exception:
        return False


def _check_11h_rest(employee, new_shift_start, new_shift_end, exclude_shift_id=None):
    """
    UK WTR Reg 10: minimum 11 hours rest between consecutive shifts.
    Returns (is_ok, conflicting_shift_or_None).
    """
    MIN_REST_SECONDS = 11 * 3600
    window_start = new_shift_start - timedelta(hours=35)
    window_end = new_shift_end + timedelta(hours=35)
    qs = Shift.objects.filter(
        employee=employee,
        shift_end__gte=window_start,
        shift_start__lte=window_end,
    )
    if exclude_shift_id:
        qs = qs.exclude(pk=exclude_shift_id)
    for shift in qs:
        gap_before = (new_shift_start - shift.shift_end).total_seconds()
        if 0 < gap_before < MIN_REST_SECONDS:
            return False, shift
        gap_after = (shift.shift_start - new_shift_end).total_seconds()
        if 0 < gap_after < MIN_REST_SECONDS:
            return False, shift
    return True, None


class ShiftViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if not hasattr(self.request, "company"):
            return Shift.objects.none()
        qs = (
            Shift.objects
            .filter(company=self.request.company)
            .select_related("employee", "employee__user")
            .order_by("-shift_start")
        )
        if self.request.user.role == "admin":
            return qs
        employee = Employee.objects.filter(
            user=self.request.user, company=self.request.company
        ).first()
        if not employee:
            return qs.none()
        return qs.filter(employee=employee)

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def _run_wtr_checks(self, employee, shift_start, shift_end, exclude_shift_id=None):
        """
        UK WTR compliance checks — only for UK employees without active opt-out.
        Raises ValidationError on violation.
        """
        country = getattr(employee, "country", None) or "US"
        if country.upper() != "UK":
            return

        # 11-hour rest (WTR 1998 Reg 10) — applies even with opt-out
        rest_ok, conflicting = _check_11h_rest(employee, shift_start, shift_end, exclude_shift_id)
        if not rest_ok:
            fmt_start = conflicting.shift_start.strftime("%Y-%m-%d %H:%M")
            fmt_end = conflicting.shift_end.strftime("%H:%M")
            raise ValidationError({
                "shift_start": (
                    f"UK WTR violation: Less than 11 hours rest between this shift and "
                    f"existing shift {fmt_start} – {fmt_end}. "
                    "Minimum 11 hours rest required (WTR 1998 Reg 10)."
                )
            })

        # 48-hour rolling average (WTR 1998 Reg 4) — blocked without opt-out
        if not _check_wtr_opt_out(employee):
            weekly_hours = _build_17_week_hours_with_new_shift(
                employee, shift_start, shift_end, exclude_shift_id=exclude_shift_id
            )
            if weekly_hours:
                avg = sum(weekly_hours) / len(weekly_hours)
                if avg > 48:
                    raise ValidationError({
                        "shift_start": (
                            f"UK WTR violation: This shift would push the 17-week rolling "
                            f"average to {avg:.1f} hrs/week, exceeding the 48-hour limit. "
                            "The employee must sign a WTR opt-out agreement first. "
                            "(WTR 1998 Reg 4)"
                        )
                    })

    def perform_create(self, serializer):
        employee = serializer.validated_data.get("employee")
        if employee and employee.company_id != self.request.company.id:
            raise ValidationError({"employee": "This employee does not belong to your company."})
        location = serializer.validated_data.get("location")
        if location and getattr(location, "company_id", None) and location.company_id != self.request.company.id:
            raise ValidationError({"location": "This location does not belong to your company."})
        if employee:
            shift_start = serializer.validated_data.get("shift_start")
            shift_end = serializer.validated_data.get("shift_end")
            if shift_start and shift_end:
                self._run_wtr_checks(employee, shift_start, shift_end)
        serializer.save(company=self.request.company)

    def perform_update(self, serializer):
        instance = self.get_object()
        employee = serializer.validated_data.get("employee", instance.employee)
        shift_start = serializer.validated_data.get("shift_start", instance.shift_start)
        shift_end = serializer.validated_data.get("shift_end", instance.shift_end)
        if employee:
            self._run_wtr_checks(employee, shift_start, shift_end, exclude_shift_id=instance.pk)
        serializer.save()

    def retrieve(self, request, *args, **kwargs):
        shift = self.get_object()
        if request.user.role != "admin" and shift.employee.user_id != request.user.id:
            return Response({"detail": "Not found."}, status=404)
        return super().retrieve(request, *args, **kwargs)
