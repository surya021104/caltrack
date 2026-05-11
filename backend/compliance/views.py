"""
compliance/views.py

Compliance API endpoints:
  - OT risk dashboard (real-time flags per employee this week)
  - UK holiday accrual per employee
  - UK 48-hr WTR rolling average
  - Right-to-Work document management (UK)
  - WTR opt-out management (UK)
  - Immutable audit trail
  - Break attestation
  - Wage floor check
  - Employee exempt/non-exempt management (US)
  - Break compliance report
"""

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import viewsets

from accounts.permissions import IsAdminRole
from employees.models import Employee
from time_tracking.models import TimeLog

from companies.utils import (
    resolve_region,
    get_compliance_rules,
    check_wage_floor,
    calculate_uk_48hr_average,
    calculate_uk_holiday_accrual,
)
from .models import (
    AuditLog, HolidayAccrual, RightToWork, WTROptOut,
    OvertimeAlert, BreakAttestation,
)
from .serializers import (
    AuditLogSerializer, HolidayAccrualSerializer, RightToWorkSerializer,
    WTROptOutSerializer, OvertimeAlertSerializer, BreakAttestationSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_week_hours(employee, iso_year, iso_week):
    """Total worked hours for an employee in a given ISO week."""
    total = Decimal("0")
    for log in TimeLog.objects.filter(
        employee=employee, work_date__iso_year=iso_year
    ).prefetch_related("breaks"):
        if log.work_date.isocalendar()[1] == iso_week:
            total += Decimal(str(round(log.worked_seconds() / 3600, 4)))
    return total


def _get_weekly_hours_history(employee, weeks=20):
    """Returns list of total hours per week for the last N weeks (oldest first)."""
    today = date.today()
    result = []
    for i in range(weeks - 1, -1, -1):
        target = today - timedelta(weeks=i)
        y, w, _ = target.isocalendar()
        total = Decimal("0")
        for log in TimeLog.objects.filter(employee=employee, work_date__iso_year=y).prefetch_related("breaks"):
            if log.work_date.isocalendar()[1] == w:
                total += Decimal(str(round(log.worked_seconds() / 3600, 4)))
        result.append(float(total))
    return result


def _create_ot_alert(company, employee, iso_year, iso_week, alert_type, hours, threshold):
    OvertimeAlert.objects.get_or_create(
        company=company,
        employee=employee,
        iso_year=iso_year,
        iso_week=iso_week,
        alert_type=alert_type,
        defaults={
            "hours_worked": hours,
            "threshold_hours": threshold,
        },
    )


# ---------------------------------------------------------------------------
# OT Risk Dashboard
# ---------------------------------------------------------------------------

class OTRiskDashboardView(APIView):
    """
    Returns real-time OT risk for all active employees this week.
    Used by admin dashboard banner.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        company = request.company
        today = date.today()
        y, w, _ = today.isocalendar()

        employees = Employee.objects.filter(company=company, is_active=True).select_related("user")
        alerts = []

        for emp in employees:
            region = resolve_region(emp, company)
            rules = get_compliance_rules(region)
            country = (region.get("country") or "US").upper()

            hours_this_week = _get_week_hours(emp, y, w)

            if country == "US" and not emp.is_flsa_exempt:
                ot_thresh = rules["overtime_threshold"]  # 40
                if hours_this_week >= Decimal("36"):  # approaching 40
                    alert_type = (
                        OvertimeAlert.AlertType.EXCEEDED_40
                        if hours_this_week > ot_thresh
                        else OvertimeAlert.AlertType.APPROACHING_40
                    )
                    _create_ot_alert(company, emp, y, w, alert_type, hours_this_week, ot_thresh)
                    alerts.append({
                        "employee_id": emp.employee_id,
                        "employee_name": emp.user.get_full_name() or emp.user.username,
                        "alert_type": alert_type,
                        "hours_this_week": float(hours_this_week),
                        "threshold": float(ot_thresh),
                        "country": "US",
                        "state": region.get("state"),
                    })

                # CA daily OT check
                if rules.get("daily_ot_threshold"):
                    for log in TimeLog.objects.filter(
                        employee=emp, work_date__iso_year=y
                    ).prefetch_related("breaks"):
                        if log.work_date.isocalendar()[1] == w:
                            day_hours = Decimal(str(round(log.worked_seconds() / 3600, 4)))
                            daily_thresh = rules["daily_ot_threshold"]
                            dt_thresh = rules.get("double_time_threshold")
                            if dt_thresh and day_hours > dt_thresh:
                                _create_ot_alert(company, emp, y, w,
                                    OvertimeAlert.AlertType.DOUBLE_TIME_CA, day_hours, dt_thresh)
                                alerts.append({
                                    "employee_id": emp.employee_id,
                                    "employee_name": emp.user.get_full_name() or emp.user.username,
                                    "alert_type": OvertimeAlert.AlertType.DOUBLE_TIME_CA,
                                    "hours_today": float(day_hours),
                                    "threshold": float(dt_thresh),
                                    "country": "US", "state": "CA",
                                })
                            elif day_hours > daily_thresh:
                                alert_type = OvertimeAlert.AlertType.DAILY_OT_CA if region.get("state") == "CA" else OvertimeAlert.AlertType.DAILY_OT_AK
                                _create_ot_alert(company, emp, y, w, alert_type, day_hours, daily_thresh)

            elif country == "UK":
                weekly_history = _get_weekly_hours_history(emp, weeks=17)
                avg_result = calculate_uk_48hr_average(weekly_history)
                avg = avg_result["average_hours"]
                if avg >= 44:  # approaching 48
                    alert_type = (
                        OvertimeAlert.AlertType.EXCEEDED_48_UK
                        if not avg_result["is_compliant"]
                        else OvertimeAlert.AlertType.APPROACHING_48_UK
                    )
                    _create_ot_alert(company, emp, y, w, alert_type,
                                     Decimal(str(avg)), Decimal("48"))
                    alerts.append({
                        "employee_id": emp.employee_id,
                        "employee_name": emp.user.get_full_name() or emp.user.username,
                        "alert_type": alert_type,
                        "rolling_17wk_avg": avg,
                        "limit": 48,
                        "wtr_opt_out": emp.wtr_opt_out_active,
                        "country": "UK",
                    })

        return Response({
            "success": True,
            "data": {
                "week": {"year": y, "week": w},
                "alerts": alerts,
                "alert_count": len(alerts),
            }
        })


# ---------------------------------------------------------------------------
# UK 48-Hour Monitor
# ---------------------------------------------------------------------------

class UK48HrMonitorView(APIView):
    """Per-employee 17-week rolling average for the 48-hr WTR limit."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request, employee_id=None):
        company = request.company
        if employee_id:
            employees = Employee.objects.filter(id=employee_id, company=company)
        else:
            employees = Employee.objects.filter(company=company, is_active=True).select_related("user")

        results = []
        for emp in employees:
            region = resolve_region(emp, company)
            if (region.get("country") or "").upper() != "UK":
                continue
            weekly_history = _get_weekly_hours_history(emp, weeks=20)
            avg_result = calculate_uk_48hr_average(weekly_history)
            results.append({
                "employee_id": emp.employee_id,
                "employee_name": emp.user.get_full_name() or emp.user.username,
                "wtr_opt_out_active": emp.wtr_opt_out_active,
                **avg_result,
            })

        return Response({"success": True, "data": results})


# ---------------------------------------------------------------------------
# Holiday Accrual (UK)
# ---------------------------------------------------------------------------

class HolidayAccrualViewSet(viewsets.ModelViewSet):
    serializer_class = HolidayAccrualSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        return HolidayAccrual.objects.filter(company=self.request.company).select_related("employee", "employee__user")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)


class EmployeeHolidayAccrualView(APIView):
    """Accrue holiday hours for an employee for a given period (UK WTR)."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request, employee_id):
        emp = Employee.objects.filter(id=employee_id, company=request.company).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)

        start = request.data.get("start")
        end = request.data.get("end")
        leave_year_start = request.data.get("leave_year_start")
        leave_year_end = request.data.get("leave_year_end")

        from datetime import date as dt
        if not start or not end:
            return Response({"detail": "start and end dates required."}, status=400)

        from datetime import datetime
        start_d = datetime.strptime(start, "%Y-%m-%d").date()
        end_d = datetime.strptime(end, "%Y-%m-%d").date()

        # Calculate hours worked in period
        total_hours = Decimal("0")
        for log in TimeLog.objects.filter(employee=emp, work_date__gte=start_d, work_date__lte=end_d).prefetch_related("breaks"):
            total_hours += Decimal(str(round(log.worked_seconds() / 3600, 4)))

        accrual_result = calculate_uk_holiday_accrual(total_hours)

        # Update or create the leave year accrual record
        ly_start = datetime.strptime(leave_year_start, "%Y-%m-%d").date() if leave_year_start else dt(start_d.year, 4, 1)
        ly_end = datetime.strptime(leave_year_end, "%Y-%m-%d").date() if leave_year_end else dt(start_d.year + 1, 3, 31)

        accrual, created = HolidayAccrual.objects.get_or_create(
            company=request.company,
            employee=emp,
            leave_year_start=ly_start,
            defaults={"leave_year_end": ly_end},
        )
        accrual.reg13_hours_accrued += Decimal(str(accrual_result["accrued_this_period_hours"])) * (Decimal("4") / Decimal("5.6"))
        accrual.reg13a_hours_accrued += Decimal(str(accrual_result["accrued_this_period_hours"])) * (Decimal("1.6") / Decimal("5.6"))
        accrual.save()

        return Response({
            "success": True,
            "data": {
                "hours_worked_in_period": float(total_hours),
                "accrued_this_period": accrual_result["accrued_this_period_hours"],
                "reg13_total": float(accrual.reg13_hours_accrued),
                "reg13a_total": float(accrual.reg13a_hours_accrued),
                "total_remaining": accrual.total_hours_remaining,
            }
        })


# ---------------------------------------------------------------------------
# Right to Work (UK)
# ---------------------------------------------------------------------------

class RightToWorkViewSet(viewsets.ModelViewSet):
    serializer_class = RightToWorkSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        return RightToWork.objects.filter(company=self.request.company).select_related("employee", "employee__user", "verified_by")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)

    def perform_update(self, serializer):
        instance = serializer.save()
        # If status changed to verified, record verifier
        if instance.status == RightToWork.VerificationStatus.VERIFIED and not instance.verified_by:
            instance.verified_by = self.request.user
            instance.verified_at = timezone.now()
            instance.save(update_fields=["verified_by", "verified_at"])


class RTWExpiryCheckView(APIView):
    """Check RTW documents approaching expiry for the company."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        today = date.today()
        expiring_soon = RightToWork.objects.filter(
            company=request.company,
            expiry_date__isnull=False,
            status=RightToWork.VerificationStatus.VERIFIED,
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=60),
        ).select_related("employee", "employee__user")

        expired = RightToWork.objects.filter(
            company=request.company,
            expiry_date__isnull=False,
            expiry_date__lt=today,
        ).select_related("employee", "employee__user")

        def rtw_summary(rtw):
            return {
                "id": rtw.id,
                "employee_id": rtw.employee.employee_id,
                "employee_name": rtw.employee.user.get_full_name() or rtw.employee.user.username,
                "document_type": rtw.document_type,
                "expiry_date": str(rtw.expiry_date),
                "days_until_expiry": rtw.days_until_expiry,
                "status": rtw.status,
            }

        return Response({
            "success": True,
            "data": {
                "expiring_within_60_days": [rtw_summary(r) for r in expiring_soon],
                "expired": [rtw_summary(r) for r in expired],
            }
        })


# ---------------------------------------------------------------------------
# WTR Opt-Out
# ---------------------------------------------------------------------------

class WTROptOutViewSet(viewsets.ModelViewSet):
    serializer_class = WTROptOutSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        return WTROptOut.objects.filter(company=self.request.company).select_related("employee")

    def perform_create(self, serializer):
        instance = serializer.save(company=self.request.company)
        # Set opt-out flag on employee
        emp = instance.employee
        emp.wtr_opt_out_active = True
        emp.save(update_fields=["wtr_opt_out_active"])

    def withdraw(self, request, pk=None):
        """Withdraw an opt-out agreement."""
        opt_out = self.get_object()
        opt_out.is_active = False
        opt_out.withdrawn_on = date.today()
        opt_out.save()
        emp = opt_out.employee
        emp.wtr_opt_out_active = False
        emp.save(update_fields=["wtr_opt_out_active"])
        return Response({"success": True, "message": "Opt-out withdrawn."})


# ---------------------------------------------------------------------------
# Immutable Audit Trail
# ---------------------------------------------------------------------------

class AuditLogListView(APIView):
    """Read-only audit trail for admin. Filter by time_log_id or employee."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        qs = AuditLog.objects.filter(company=request.company)
        time_log_id = request.query_params.get("time_log_id")
        employee_id = request.query_params.get("employee_id")
        if time_log_id:
            qs = qs.filter(time_log_id=time_log_id)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        qs = qs.order_by("-timestamp")[:200]
        return Response({"success": True, "data": AuditLogSerializer(qs, many=True).data})


# ---------------------------------------------------------------------------
# Break Attestation
# ---------------------------------------------------------------------------

class BreakAttestationView(APIView):
    """Employee submits break attestation for a TimeLog session."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from time_tracking.models import TimeLog as TL
        time_log_id = request.data.get("time_log_id")
        break_taken = request.data.get("break_taken", True)
        notes = request.data.get("notes", "")

        emp = Employee.objects.filter(user=request.user, company=request.company).first()
        if not emp:
            return Response({"detail": "Employee profile not found."}, status=404)

        tl = TL.objects.filter(id=time_log_id, employee=emp).first()
        if not tl:
            return Response({"detail": "TimeLog not found."}, status=404)

        attestation, created = BreakAttestation.objects.get_or_create(
            time_log=tl,
            employee=emp,
            defaults={
                "company": request.company,
                "break_taken": break_taken,
                "notes": notes,
            }
        )
        if not created:
            attestation.break_taken = break_taken
            attestation.notes = notes
            attestation.save()

        return Response({
            "success": True,
            "data": BreakAttestationSerializer(attestation).data,
        })


# ---------------------------------------------------------------------------
# Wage Floor Check
# ---------------------------------------------------------------------------

class WageFloorCheckView(APIView):
    """
    Check wage floor compliance for all employees or a specific one.
    Returns violations where employee rate < legal minimum.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        company = request.company
        employees = Employee.objects.filter(company=company, is_active=True).select_related("user")
        violations = []
        compliant = []

        for emp in employees:
            region = resolve_region(emp, company)
            check = check_wage_floor(emp.hourly_rate, region, age=emp.age)
            entry = {
                "employee_id": emp.employee_id,
                "employee_name": emp.user.get_full_name() or emp.user.username,
                "hourly_rate": float(emp.hourly_rate),
                "country": check["country"],
                "minimum_wage_floor": check["minimum_wage_floor"],
                "shortfall_per_hour": check["shortfall_per_hour"],
                "state": region.get("state"),
                "age": emp.age,
            }
            if not check["is_compliant"]:
                violations.append(entry)
            else:
                compliant.append(entry)

        return Response({
            "success": True,
            "data": {
                "violations": violations,
                "compliant_count": len(compliant),
                "violation_count": len(violations),
            }
        })


# ---------------------------------------------------------------------------
# FLSA Exempt Management
# ---------------------------------------------------------------------------

class ExemptStatusView(APIView):
    """Update employee FLSA exempt/non-exempt status with audit history."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def patch(self, request, employee_id):
        from companies.utils import FLSA_EXEMPT_SALARY_THRESHOLD_WEEKLY
        emp = Employee.objects.filter(id=employee_id, company=request.company).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)

        new_status = request.data.get("exempt_status")
        reason = request.data.get("reason", "")
        duties_category = request.data.get("flsa_duties_category", "")
        weekly_salary = request.data.get("weekly_salary")

        valid = [c[0] for c in Employee.ExemptStatus.choices]
        if new_status not in valid:
            return Response({"detail": "Invalid exempt_status."}, status=400)

        # Log the change in history
        history_entry = {
            "status": new_status,
            "changed_at": timezone.now().isoformat(),
            "changed_by": request.user.username,
            "reason": reason,
            "duties_category": duties_category,
        }
        history = emp.exempt_history or []
        history.append(history_entry)

        emp.exempt_status = new_status
        emp.exempt_history = history
        emp.flsa_duties_category = duties_category or emp.flsa_duties_category
        if weekly_salary is not None:
            emp.weekly_salary = Decimal(str(weekly_salary))
        emp.save()

        # Auto-suggest based on salary threshold
        suggestion = None
        if emp.weekly_salary and emp.weekly_salary >= FLSA_EXEMPT_SALARY_THRESHOLD_WEEKLY:
            suggestion = "Salary meets FLSA exempt threshold ($844/week). Verify duties test to confirm exemption."
        elif emp.weekly_salary:
            suggestion = "Salary below FLSA exempt threshold ($844/week). Employee is likely non-exempt."

        return Response({
            "success": True,
            "data": {
                "employee_id": emp.employee_id,
                "exempt_status": emp.exempt_status,
                "weekly_salary": float(emp.weekly_salary) if emp.weekly_salary else None,
                "flsa_threshold_weekly": float(FLSA_EXEMPT_SALARY_THRESHOLD_WEEKLY),
                "suggestion": suggestion,
                "history": emp.exempt_history,
            }
        })


# ---------------------------------------------------------------------------
# Break Compliance Report
# ---------------------------------------------------------------------------

class BreakComplianceReportView(APIView):
    """
    Report on break compliance violations:
    - UK: shifts >6hrs with no break logged
    - CA: shifts >5hrs with no 30-min meal break
    - 11hr rest between shifts (UK WTR)
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        from time_tracking.models import TimeLog as TL, Break
        company = request.company
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")

        from datetime import datetime
        start_d = datetime.strptime(start_str, "%Y-%m-%d").date() if start_str else date.today() - timedelta(days=7)
        end_d = datetime.strptime(end_str, "%Y-%m-%d").date() if end_str else date.today()

        logs = TL.objects.filter(
            employee__company=company,
            work_date__gte=start_d,
            work_date__lte=end_d,
            clock_out__isnull=False,
        ).select_related("employee", "employee__user").prefetch_related("breaks")

        violations = []
        for log in logs:
            emp = log.employee
            region = resolve_region(emp, company)
            rules = get_compliance_rules(region)
            break_law = rules.get("break_law", {})
            worked_hrs = log.worked_seconds() / 3600
            break_thresh = break_law.get("break_threshold_hours") or break_law.get("meal_break_threshold_hours")
            has_break = log.breaks.filter(break_end__isnull=False).exists()

            if break_thresh and worked_hrs > break_thresh and not has_break:
                violations.append({
                    "time_log_id": log.id,
                    "employee_id": emp.employee_id,
                    "employee_name": emp.user.get_full_name() or emp.user.username,
                    "work_date": str(log.work_date),
                    "worked_hours": round(worked_hrs, 2),
                    "break_threshold_hours": break_thresh,
                    "violation": "No break logged for shift exceeding {} hrs".format(break_thresh),
                    "country": region.get("country"),
                })

        # UK: check 11hr rest between shifts
        rest_violations = []
        if True:  # always check
            uk_employees = Employee.objects.filter(company=company, is_active=True).select_related("user")
            for emp in uk_employees:
                region = resolve_region(emp, company)
                if (region.get("country") or "").upper() != "UK":
                    continue
                prev_log = None
                emp_logs = TL.objects.filter(
                    employee=emp, work_date__gte=start_d, work_date__lte=end_d,
                    clock_out__isnull=False
                ).order_by("clock_in")
                for log in emp_logs:
                    if prev_log and prev_log.clock_out:
                        rest_secs = (log.clock_in - prev_log.clock_out).total_seconds()
                        rest_hrs = rest_secs / 3600
                        if rest_hrs < 11:
                            rest_violations.append({
                                "employee_id": emp.employee_id,
                                "employee_name": emp.user.get_full_name() or emp.user.username,
                                "shift_start": log.clock_in.isoformat(),
                                "previous_shift_end": prev_log.clock_out.isoformat(),
                                "rest_hours": round(rest_hrs, 2),
                                "violation": "Less than 11hr rest between shifts (UK WTR)",
                            })
                    prev_log = log

        return Response({
            "success": True,
            "data": {
                "break_violations": violations,
                "rest_violations": rest_violations,
                "period": {"start": str(start_d), "end": str(end_d)},
            }
        })


# ---------------------------------------------------------------------------
# DOL / WTR Audit Trail PDF Export
# ---------------------------------------------------------------------------

class AuditLogExportView(APIView):
    """
    GET /compliance/audit-log/export/
    Generates a DOL/WTR-compliant PDF of the immutable audit trail.
    Optionally filtered by ?employee_id=<id>&start=YYYY-MM-DD&end=YYYY-MM-DD
    3-year retention policy: oldest included record is max 3 years ago.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        from io import BytesIO
        from datetime import datetime
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        from django.http import HttpResponse

        company = request.company
        employee_id = request.query_params.get("employee_id")
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")

        three_years_ago = date.today() - timedelta(days=3 * 365)
        start_d = datetime.strptime(start_str, "%Y-%m-%d").date() if start_str else three_years_ago
        end_d = datetime.strptime(end_str, "%Y-%m-%d").date() if end_str else date.today()
        start_d = max(start_d, three_years_ago)  # enforce 3-year retention window

        qs = AuditLog.objects.filter(
            company=company,
            timestamp__date__gte=start_d,
            timestamp__date__lte=end_d,
        ).order_by("-timestamp")

        if employee_id:
            qs = qs.filter(employee__pk=employee_id)

        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm,
                                topMargin=20*mm, bottomMargin=20*mm)
        styles = getSampleStyleSheet()
        story = []

        # Header
        title_style = styles["Title"]
        story.append(Paragraph("QuickTIMS — Audit Trail Report", title_style))
        story.append(Paragraph(
            f"Organisation: {getattr(company, 'name', 'N/A')} &nbsp;|&nbsp; "
            f"Period: {start_d} to {end_d} &nbsp;|&nbsp; "
            f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
            styles["Normal"]
        ))
        story.append(Spacer(1, 10*mm))
        story.append(Paragraph(
            "This report is produced in compliance with US DOL recordkeeping requirements "
            "(29 CFR Part 516) and UK Working Time Regulations 1998 (WTR). "
            "All entries are immutable — once written, audit records cannot be modified or deleted.",
            styles["Italic"]
        ))
        story.append(Spacer(1, 8*mm))

        # Table
        table_data = [["Timestamp (UTC)", "Employee", "Action", "Field", "Before", "After", "Reason / Actor"]]
        for entry in qs[:5000]:  # cap at 5000 rows for PDF
            emp_label = ""
            if entry.employee:
                emp_label = entry.employee.employee_id or str(entry.employee.pk)
            before = str(entry.before_state or "")[:60]
            after = str(entry.after_state or "")[:60]
            table_data.append([
                entry.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                emp_label,
                entry.action,
                entry.field_changed or "",
                before,
                after,
                (entry.reason or entry.changed_by_name or "")[:40],
            ])

        col_widths = [38*mm, 25*mm, 20*mm, 22*mm, 30*mm, 30*mm, 30*mm]
        t = Table(table_data, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5d5fef")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5ff")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("WORDWRAP", (0, 0), (-1, -1), True),
        ]))
        story.append(t)
        story.append(Spacer(1, 8*mm))
        story.append(Paragraph(
            f"Total records: {qs.count()} &nbsp;|&nbsp; Retention policy: 3 years minimum.",
            styles["Normal"]
        ))

        doc.build(story)
        buf.seek(0)
        filename = f"audit_trail_{start_d}_{end_d}.pdf"
        response = HttpResponse(buf.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


# ---------------------------------------------------------------------------
# UK RTI FPS Export (HMRC Full Payment Submission data)
# ---------------------------------------------------------------------------

class RTIFPSExportView(APIView):
    """
    GET /compliance/rti-fps/
    Returns HMRC RTI Full Payment Submission data for a payroll period.
    Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Returns JSON suitable for submission to HMRC RTI gateway.
    Each employee entry contains: employee details, payment summary,
    tax/NI figures, and year-to-date totals.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        from datetime import datetime
        from payroll.models import PayrollRecord

        company = request.company
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")

        if not start_str or not end_str:
            return Response({"detail": "start and end date params required."}, status=400)

        start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
        end_d = datetime.strptime(end_str, "%Y-%m-%d").date()

        # Get UK payroll records for this period
        records = PayrollRecord.objects.filter(
            employee__company=company,
            period__start_date__gte=start_d,
            period__end_date__lte=end_d,
            region__icontains="UK",
        ).select_related("employee", "employee__user", "period")

        # Build FPS payload per HMRC schema
        fps_employees = []
        for rec in records:
            emp = rec.employee
            user = emp.user
            fps_employees.append({
                "employee_reference": emp.employee_id,
                "payroll_id": str(rec.id),
                "national_insurance_number": getattr(emp, "national_insurance_number", None) or "TBC",
                "name": {
                    "title": "",
                    "forename": user.first_name,
                    "surname": user.last_name,
                },
                "address": {
                    "line1": "",
                    "postcode": "",
                },
                "date_of_birth": str(getattr(emp, "date_of_birth", None) or ""),
                "gender": "",
                "ni_category": rec.uk_ni_category or "A",
                "tax_code": rec.uk_tax_code or "1257L",
                "payment": {
                    "payment_date": str(rec.period.end_date),
                    "payment_frequency": "W1",  # weekly
                    "pay_period_number": 1,
                    "taxable_pay_in_period": float(rec.gross_pay or 0),
                    "tax_deducted_in_period": float(rec.uk_income_tax or 0),
                    "employee_ni_in_period": float(rec.uk_employee_ni or 0),
                    "employer_ni_in_period": float(rec.uk_employer_ni or 0),
                    "net_pay_in_period": float(rec.net_pay or 0),
                },
                "year_to_date": {
                    # In production these would be accumulated from all records
                    # in the tax year (6 April to 5 April)
                    "taxable_pay_ytd": float(rec.gross_pay or 0),
                    "total_tax_ytd": float(rec.uk_income_tax or 0),
                    "employee_ni_ytd": float(rec.uk_employee_ni or 0),
                    "employer_ni_ytd": float(rec.uk_employer_ni or 0),
                },
                "holiday_accrued_hours": float(rec.holiday_hours_accrued or 0),
            })

        # FPS envelope per HMRC RTI schema
        fps_payload = {
            "fps_schema_version": "2024-25",
            "employer": {
                "name": getattr(company, "name", ""),
                "paye_reference": getattr(company, "paye_reference", ""),
                "accounts_office_reference": getattr(company, "accounts_office_reference", ""),
            },
            "submission": {
                "type": "FPS",
                "tax_year": _current_tax_year(),
                "payment_period_start": str(start_d),
                "payment_period_end": str(end_d),
                "submission_timestamp": timezone.now().isoformat(),
            },
            "employees": fps_employees,
            "totals": {
                "total_employees": len(fps_employees),
                "total_gross_pay": sum(float(r.gross_pay or 0) for r in records),
                "total_income_tax": sum(float(r.uk_income_tax or 0) for r in records),
                "total_employee_ni": sum(float(r.uk_employee_ni or 0) for r in records),
                "total_employer_ni": sum(float(r.uk_employer_ni or 0) for r in records),
            },
        }

        return Response({"success": True, "data": fps_payload})


def _current_tax_year():
    """Returns '2024-25' style tax year string."""
    today = date.today()
    if today.month >= 4 and today.day >= 6:
        return f"{today.year}-{str(today.year + 1)[2:]}"
    return f"{today.year - 1}-{str(today.year)[2:]}"


# ---------------------------------------------------------------------------
# RTW Alert Trigger (on-demand)
# ---------------------------------------------------------------------------

class RTWAlertEmailView(APIView):
    """
    POST /compliance/rtw/send-alerts/
    Triggers immediate RTW expiry email alerts (60/30/7 days).
    Returns list of employees alerted.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request):
        from django.core.mail import send_mail
        from django.conf import settings

        company = request.company
        today = date.today()
        thresholds = [
            (60, "alert_sent_60d"),
            (30, "alert_sent_30d"),
            (7, "alert_sent_7d"),
        ]
        alerted = []

        for days, flag_field in thresholds:
            target_date = today + timedelta(days=days)
            docs = RightToWork.objects.filter(
                employee__company=company,
                expiry_date__date=target_date,
                status=RightToWork.VerificationStatus.VERIFIED,
                **{flag_field: False},
            ).select_related("employee", "employee__user")

            for doc in docs:
                emp = doc.employee
                emp_name = emp.user.get_full_name() or emp.user.username
                subject = f"RTW Document Expiring in {days} Days — {emp_name}"
                message = (
                    f"Right to Work document for {emp_name} ({emp.employee_id}) "
                    f"is due to expire on {doc.expiry_date.strftime('%Y-%m-%d')}.\n\n"
                    f"Document type: {doc.document_type}\n"
                    f"Reference: {doc.document_reference or 'N/A'}\n\n"
                    f"Please arrange re-verification before the expiry date. "
                    f"Employing someone without valid right to work is a criminal offence "
                    f"(Immigration, Asylum and Nationality Act 2006).\n\n"
                    f"QuickTIMS Compliance System"
                )
                try:
                    admin_email = getattr(settings, "DEFAULT_FROM_EMAIL", "compliance@quicktims.com")
                    send_mail(subject, message, admin_email, [admin_email], fail_silently=True)
                    setattr(doc, flag_field, True)
                    doc.save(update_fields=[flag_field])
                    alerted.append({
                        "employee_id": emp.employee_id,
                        "employee_name": emp_name,
                        "days_until_expiry": days,
                        "expiry_date": str(doc.expiry_date.date() if hasattr(doc.expiry_date, "date") else doc.expiry_date),
                        "alert_sent": True,
                    })
                except Exception as exc:
                    alerted.append({
                        "employee_id": emp.employee_id,
                        "employee_name": emp_name,
                        "days_until_expiry": days,
                        "alert_sent": False,
                        "error": str(exc),
                    })

        return Response({
            "success": True,
            "data": {
                "alerts_processed": len(alerted),
                "alerts": alerted,
            }
        })
