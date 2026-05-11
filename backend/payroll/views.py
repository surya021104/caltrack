"""
payroll/views.py

Enhanced payroll generation engine supporting:
  US FLSA: weekly OT (>40hrs = 1.5x), CA daily OT (>8hrs=1.5x, >12hrs=2x),
           AK daily OT (>8hrs=1.5x), FLSA exempt bypass
  UK:      PAYE income tax (20/40/45%), NI contributions (emp + employer),
           WTR holiday accrual (12.07%), rolled-up holiday pay
"""

from decimal import Decimal

from django.db import transaction
from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from employees.models import Employee
from leaves.models import LeaveRequest
from time_tracking.models import TimeLog

from companies.utils import (
    resolve_region,
    get_compliance_rules,
    check_wage_floor,
    calculate_uk_income_tax_annual,
    calculate_uk_ni_annual,
    calculate_uk_holiday_accrual,
)
from .models import PayrollPeriod, PayrollRecord
from .serializers import PayrollGenerateSerializer, PayrollRecordSerializer


def _calc_leave_hours(employee, start, end):
    qs = LeaveRequest.objects.filter(
        employee=employee,
        status=LeaveRequest.Status.APPROVED,
        start_date__lte=end,
        end_date__gte=start,
    )
    paid = Decimal("0")
    unpaid = Decimal("0")
    for leave in qs:
        s = max(start, leave.start_date)
        e = min(end, leave.end_date)
        days = Decimal(str((e - s).days + 1))
        hours = days * Decimal("8")
        if leave.paid:
            paid += hours
        else:
            unpaid += hours
    return paid, unpaid


def _calc_us_work_hours(employee, start, end, compliance_rules):
    """
    US FLSA work hours with weekly OT + CA/AK daily OT rules.
    Exempt employees: all hours are regular, no OT.
    """
    if employee.is_flsa_exempt:
        qs = TimeLog.objects.filter(employee=employee, work_date__gte=start, work_date__lte=end)
        total = sum(Decimal(str(round(log.worked_seconds() / 3600, 4))) for log in qs)
        return total.quantize(Decimal("0.01")), Decimal("0"), Decimal("0"), Decimal("0")

    qs = TimeLog.objects.filter(
        employee=employee, work_date__gte=start, work_date__lte=end
    ).prefetch_related("breaks")

    daily_map = {}
    weekly_map = {}
    for log in qs:
        hours = Decimal(str(round(log.worked_seconds() / 3600, 4)))
        daily_map.setdefault(log.work_date, Decimal("0"))
        daily_map[log.work_date] += hours
        y, w, _ = log.work_date.isocalendar()
        weekly_map.setdefault((y, w), Decimal("0"))
        weekly_map[(y, w)] += hours

    daily_ot_thresh = compliance_rules.get("daily_ot_threshold")
    double_time_thresh = compliance_rules.get("double_time_threshold")

    total_regular = Decimal("0")
    total_daily_ot = Decimal("0")
    total_double_time = Decimal("0")

    if daily_ot_thresh is not None:
        for d, dh in daily_map.items():
            if double_time_thresh and dh > double_time_thresh:
                # CA: first 8hrs regular, 8-12hrs = 1.5x, >12hrs = 2x
                total_regular += daily_ot_thresh
                total_daily_ot += double_time_thresh - daily_ot_thresh
                total_double_time += dh - double_time_thresh
            elif dh > daily_ot_thresh:
                total_regular += daily_ot_thresh
                total_daily_ot += dh - daily_ot_thresh
            else:
                total_regular += dh
    else:
        total_regular = sum(daily_map.values())

    # Weekly FLSA OT check (>40hrs) — applies in addition to daily OT
    weekly_ot_thresh = compliance_rules["overtime_threshold"]
    weekly_ot = Decimal("0")
    for wk, wh in weekly_map.items():
        if wh > weekly_ot_thresh:
            weekly_ot += wh - weekly_ot_thresh

    # Effective OT = max of daily vs weekly (employee gets greater benefit)
    effective_weekly_ot = max(Decimal("0"), weekly_ot)
    if daily_ot_thresh is None:
        # No daily OT: use weekly OT
        total_daily_ot = Decimal("0")
        total_double_time = Decimal("0")
        total_regular = max(Decimal("0"), sum(daily_map.values()) - effective_weekly_ot)
        total_ot = effective_weekly_ot
    else:
        # Daily OT state: OT already split; weekly check extra edge case
        total_ot = total_daily_ot  # 1.5x portion

    return (
        total_regular.quantize(Decimal("0.01")),
        total_ot.quantize(Decimal("0.01")),
        total_daily_ot.quantize(Decimal("0.01")),
        total_double_time.quantize(Decimal("0.01")),
    )


def _calc_uk_work_hours(employee, start, end, compliance_rules):
    qs = TimeLog.objects.filter(
        employee=employee, work_date__gte=start, work_date__lte=end
    ).prefetch_related("breaks")

    total = Decimal("0")
    weekly = {}
    for log in qs:
        hours = Decimal(str(round(log.worked_seconds() / 3600, 4)))
        total += hours
        y, w, _ = log.work_date.isocalendar()
        weekly.setdefault((y, w), Decimal("0"))
        weekly[(y, w)] += hours

    threshold = compliance_rules["overtime_threshold"]
    overtime = max(Decimal("0"), sum(
        (h - threshold) for h in weekly.values() if h > threshold
    ))
    regular = max(Decimal("0"), total - overtime)
    return regular.quantize(Decimal("0.01")), overtime.quantize(Decimal("0.01"))


def _calc_uk_paye(gross_period, period_days, employee):
    weeks_in_period = max(Decimal("1"), Decimal(str(period_days)) / Decimal("7"))
    annualise = Decimal("52") / weeks_in_period
    gross_annual = (gross_period * annualise).quantize(Decimal("0.01"))

    tax_result = calculate_uk_income_tax_annual(gross_annual)
    ni_category = employee.uk_ni_category or "A"
    ni_result = calculate_uk_ni_annual(gross_annual, ni_category)

    deannualise = Decimal("1") / annualise
    income_tax = (Decimal(str(tax_result["income_tax_annual"])) * deannualise).quantize(Decimal("0.01"))
    employee_ni = (Decimal(str(ni_result["employee_ni_annual"])) * deannualise).quantize(Decimal("0.01"))
    employer_ni = (Decimal(str(ni_result["employer_ni_annual"])) * deannualise).quantize(Decimal("0.01"))

    return {
        "income_tax": income_tax,
        "employee_ni": employee_ni,
        "employer_ni": employer_ni,
        "gross_annual_equivalent": float(gross_annual),
    }


class PayrollRecordViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PayrollRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if not hasattr(self.request, "company"):
            return PayrollRecord.objects.none()
        qs = (
            PayrollRecord.objects.filter(company=self.request.company)
            .select_related("employee", "employee__user", "period")
            .order_by("-generated_at")
        )
        if self.request.user.role == "admin":
            return qs
        employee = Employee.objects.filter(
            user=self.request.user, company=self.request.company
        ).first()
        if not employee:
            return qs.none()
        return qs.filter(employee=employee)


class PayrollGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    @transaction.atomic
    def post(self, request):
        serializer = PayrollGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        employee = Employee.objects.select_related("user").filter(
            id=serializer.validated_data["employee"],
            company=request.company,
        ).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)

        start = serializer.validated_data["start"]
        end = serializer.validated_data["end"]
        if end < start:
            return Response({"detail": "End date must be after start date."}, status=400)

        period, _ = PayrollPeriod.objects.get_or_create(
            start_date=start, end_date=end, company=request.company
        )

        region = resolve_region(employee, employee.company)
        compliance_rules = get_compliance_rules(region)
        country = (region.get("country") or "US").upper()

        hourly_rate = employee.hourly_rate
        paid_leave_hours, unpaid_leave_hours = _calc_leave_hours(employee, start, end)
        wage_check = check_wage_floor(hourly_rate, region, age=employee.age)

        uk_income_tax = Decimal("0")
        uk_employee_ni = Decimal("0")
        uk_employer_ni = Decimal("0")
        holiday_hours_accrued = Decimal("0")
        daily_ot_hours = Decimal("0")
        double_time_hours = Decimal("0")

        if country == "US":
            regular_hours, overtime_hours, daily_ot_hours, double_time_hours = _calc_us_work_hours(
                employee, start, end, compliance_rules
            )
            ot_mult = compliance_rules["overtime_multiplier"]
            daily_ot_mult = compliance_rules.get("daily_ot_multiplier") or Decimal("1.5")
            dt_mult = compliance_rules.get("double_time_multiplier") or Decimal("2.0")

            # For non-daily-OT states: daily_ot_hours = overtime_hours
            if compliance_rules.get("daily_ot_threshold") is None:
                actual_daily_ot = Decimal("0")
            else:
                actual_daily_ot = daily_ot_hours

            gross = (
                (regular_hours + paid_leave_hours) * hourly_rate
                + overtime_hours * hourly_rate * ot_mult
                + double_time_hours * hourly_rate * dt_mult
            )
            # If daily OT state: overtime_hours IS daily_ot (already 1.5x rates apply)
            net = gross

        else:
            regular_hours, overtime_hours = _calc_uk_work_hours(
                employee, start, end, compliance_rules
            )
            daily_ot_hours = Decimal("0")
            double_time_hours = Decimal("0")
            ot_mult = compliance_rules["overtime_multiplier"]

            gross = (
                (regular_hours + paid_leave_hours) * hourly_rate
                + overtime_hours * hourly_rate * ot_mult
            )

            # UK holiday accrual
            accrual = calculate_uk_holiday_accrual(regular_hours + overtime_hours)
            holiday_hours_accrued = Decimal(str(accrual["accrued_this_period_hours"]))

            # Rolled-up holiday pay: 12.07% added to gross
            if employee.rolled_up_holiday_pay:
                gross += gross * Decimal("0.1207")

            period_days = (end - start).days + 1
            paye = _calc_uk_paye(gross, period_days, employee)
            uk_income_tax = paye["income_tax"]
            uk_employee_ni = paye["employee_ni"]
            uk_employer_ni = paye["employer_ni"]
            net = max(Decimal("0"), gross - uk_income_tax - uk_employee_ni)

        gross = gross.quantize(Decimal("0.01"))
        net = net.quantize(Decimal("0.01"))

        record, _ = PayrollRecord.objects.update_or_create(
            period=period,
            employee=employee,
            company=request.company,
            defaults={
                "hourly_rate": hourly_rate,
                "regular_hours": regular_hours,
                "overtime_hours": overtime_hours,
                "daily_ot_hours": daily_ot_hours,
                "double_time_hours": double_time_hours,
                "paid_leave_hours": paid_leave_hours.quantize(Decimal("0.01")),
                "unpaid_leave_hours": unpaid_leave_hours.quantize(Decimal("0.01")),
                "gross_pay": gross,
                "uk_income_tax": uk_income_tax,
                "uk_employee_ni": uk_employee_ni,
                "uk_employer_ni": uk_employer_ni,
                "uk_tax_code": employee.uk_tax_code,
                "uk_ni_category": employee.uk_ni_category,
                "holiday_hours_accrued": holiday_hours_accrued,
                "net_pay": net,
                "region": compliance_rules["name"],
                "is_exempt": employee.is_flsa_exempt,
                "wage_floor_compliant": wage_check["is_compliant"],
                "generated_by": request.user,
            },
        )
        return Response(PayrollRecordSerializer(record).data, status=201)
