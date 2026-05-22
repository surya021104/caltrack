from collections import defaultdict
from datetime import datetime, timedelta
from math import radians, cos, sin, asin, sqrt

from django.db.models import Count, Sum, Q, F
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from employees.models import Employee
from leaves.models import LeaveRequest
from payroll.models import PayrollRecord, PayrollPeriod
from scheduling.models import Shift
from tasks.models import Task
from time_tracking.models import TimeLog


def _parse_date(value: str | None):
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


class AdminOverviewReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        start = _parse_date(request.query_params.get("start")) or (timezone.localdate() - timedelta(days=30))
        end = _parse_date(request.query_params.get("end")) or timezone.localdate()

        company = getattr(request, 'company', None)
        if not company:
            return Response({"error": "No company associated"}, status=403)

        employees_total = Employee.objects.filter(company=company).count()
        employees_active = Employee.objects.filter(company=company, is_active=True).count()

        leaves_pending = LeaveRequest.objects.filter(company=company, status=LeaveRequest.Status.PENDING).count()
        leaves_approved_range = LeaveRequest.objects.filter(
            company=company, status=LeaveRequest.Status.APPROVED, start_date__lte=end, end_date__gte=start
        ).count()

        time_logs_range = TimeLog.objects.filter(employee__company=company, work_date__gte=start, work_date__lte=end).count()
        payroll_generated_range = PayrollRecord.objects.filter(company=company, period__start_date__gte=start, period__end_date__lte=end).count()

        return Response(
            {
                "range": {"start": str(start), "end": str(end)},
                "employees": {"total": employees_total, "active": employees_active},
                "leaves": {"pending": leaves_pending, "approved_in_range": leaves_approved_range},
                "time_tracking": {"time_logs_in_range": time_logs_range},
                "payroll": {"records_generated_in_range": payroll_generated_range},
            }
        )


class DashboardAnalyticsView(APIView):
    """
    Comprehensive dashboard analytics endpoint.
    Returns aggregated data for charts and KPI cards.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        company = getattr(request, 'company', None)
        if not company:
            return Response({"error": "No company associated"}, status=403)

        from django.core.cache import cache
        cache_key = f"dashboard_analytics_{company.id}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)

        today = timezone.localdate()
        seven_days_ago = today - timedelta(days=7)
        thirty_days_ago = today - timedelta(days=30)

        # ── KPI Cards ──
        employees_total = Employee.objects.filter(company=company).count()
        employees_active = Employee.objects.filter(company=company, is_active=True).count()

        # Total hours this month (from completed time logs)
        month_logs = TimeLog.objects.filter(
            employee__company=company,
            work_date__gte=today.replace(day=1),
            clock_out__isnull=False,
        ).prefetch_related('breaks')
        total_hours_month = 0
        for log in month_logs:
            total_hours_month += log.worked_seconds() / 3600

        # Total hours this week
        week_logs = TimeLog.objects.filter(
            employee__company=company,
            work_date__gte=seven_days_ago,
            clock_out__isnull=False,
        ).prefetch_related('breaks')
        total_hours_week = 0
        for log in week_logs:
            total_hours_week += log.worked_seconds() / 3600

        # Total payroll this month
        total_payroll = PayrollRecord.objects.filter(
            company=company,
            period__start_date__gte=today.replace(day=1),
        ).aggregate(total=Sum("net_pay"))["total"] or 0

        # Active tasks
        total_tasks = Task.objects.filter(company=company).count()
        active_tasks = Task.objects.filter(
            company=company,
            status__in=["pending", "in_progress"]
        ).count()

        # Pending leaves
        pending_leaves = LeaveRequest.objects.filter(
            company=company,
            status=LeaveRequest.Status.PENDING,
        ).count()

        # Upcoming shifts count (next 7 days)
        now_dt = timezone.now()
        upcoming_shifts = Shift.objects.filter(
            company=company,
            shift_start__gte=now_dt,
            shift_start__lte=now_dt + timedelta(days=7),
        ).count()

        # ── Hours by Employee (Horizontal Bar) ──
        hours_by_employee = []
        employees = Employee.objects.filter(company=company, is_active=True).select_related("user")
        for emp in employees:
            emp_logs = TimeLog.objects.filter(
                employee=emp,
                work_date__gte=thirty_days_ago,
                clock_out__isnull=False,
            ).prefetch_related('breaks')
            total = 0
            for log in emp_logs:
                total += log.worked_seconds() / 3600
            if total > 0:
                name = emp.user.get_full_name() or emp.user.username
                hours_by_employee.append({
                    "name": name,
                    "hours": round(total, 1),
                })
        hours_by_employee.sort(key=lambda x: x["hours"], reverse=True)

        # ── Daily Hours Trend (Line Chart - last 30 days) ──
        daily_hours = defaultdict(float)
        all_logs_30d = TimeLog.objects.filter(
            employee__company=company,
            work_date__gte=thirty_days_ago,
            clock_out__isnull=False,
        ).prefetch_related('breaks')
        for log in all_logs_30d:
            day_key = str(log.work_date)
            daily_hours[day_key] += log.worked_seconds() / 3600

        daily_trend = []
        for i in range(30):
            d = thirty_days_ago + timedelta(days=i)
            key = str(d)
            daily_trend.append({
                "date": key,
                "hours": round(daily_hours.get(key, 0), 1),
            })

        # ── Task Status Distribution (Donut Chart) ──
        task_status_counts = {}
        for status_choice in Task.Status.choices:
            code = status_choice[0]
            label = status_choice[1]
            count = Task.objects.filter(company=company, status=code).count()
            task_status_counts[label] = count

        # ── Task Category Distribution (Bar Chart) ──
        task_category_counts = {}
        for cat_choice in Task.Category.choices:
            code = cat_choice[0]
            label = cat_choice[1]
            count = Task.objects.filter(company=company, category=code).count()
            if count > 0:
                task_category_counts[label] = count

        # ── Leave Status Breakdown (Pie Chart) ──
        leave_status = {}
        for status_choice in LeaveRequest.Status.choices:
            code = status_choice[0]
            label = status_choice[1]
            count = LeaveRequest.objects.filter(company=company, status=code).count()
            leave_status[label] = count

        # ── Leave Type Distribution ──
        leave_types = {}
        for type_choice in LeaveRequest.LeaveType.choices:
            code = type_choice[0]
            label = type_choice[1]
            count = LeaveRequest.objects.filter(company=company, leave_type=code).count()
            if count > 0:
                leave_types[label] = count

        # ── Clock-ins per Day (last 7 days, bar chart) ──
        attendance_daily = []
        for i in range(7):
            d = seven_days_ago + timedelta(days=i)
            count = TimeLog.objects.filter(employee__company=company, work_date=d).count()
            day_label = d.strftime("%a")
            attendance_daily.append({
                "day": day_label,
                "date": str(d),
                "count": count,
            })

        # ── Payroll trend (last 6 periods) ──
        payroll_periods = PayrollPeriod.objects.filter(company=company).order_by("-start_date")[:6]
        payroll_trend = []
        for period in reversed(list(payroll_periods)):
            total_net = PayrollRecord.objects.filter(
                company=company,
                period=period
            ).aggregate(total=Sum("net_pay"))["total"] or 0
            total_gross = PayrollRecord.objects.filter(
                company=company,
                period=period
            ).aggregate(total=Sum("gross_pay"))["total"] or 0
            payroll_trend.append({
                "period": f"{period.start_date} - {period.end_date}",
                "label": period.start_date.strftime("%b %d"),
                "net_pay": float(total_net),
                "gross_pay": float(total_gross),
            })

        # ── Location-wise Analysis ──
        from time_tracking.models import Location, JobSite

        # Gather all saved locations
        saved_locations = list(Location.objects.filter(company=company))
        job_sites = list(JobSite.objects.filter(company=company))

        # Build a merged list of known locations
        known_locations = []
        seen_names = set()
        for loc in saved_locations:
            known_locations.append({
                "name": loc.name,
                "address": loc.address,
                "lat": float(loc.lat),
                "lng": float(loc.lng),
                "radius": loc.geofence_radius or 300,
            })
            seen_names.add(loc.name.lower())
        for site in job_sites:
            if site.name.lower() not in seen_names:
                known_locations.append({
                    "name": site.name,
                    "address": site.address,
                    "lat": float(site.lat),
                    "lng": float(site.lng),
                    "radius": site.geofence_radius or 300,
                })
                seen_names.add(site.name.lower())

        # Employees per location (assigned_job_site)
        employees_by_location = []
        for loc_info in known_locations:
            # Count employees assigned to job sites matching this location name
            assigned_count = Employee.objects.filter(
                company=company,
                is_active=True,
                assigned_job_site__name__iexact=loc_info["name"],
            ).count()
            employees_by_location.append({
                "location": loc_info["name"],
                "employees": assigned_count,
            })
        employees_by_location.sort(key=lambda x: x["employees"], reverse=True)

        # Tasks per location (matching job_site or location field)
        tasks_by_location = []
        for loc_info in known_locations:
            task_count = Task.objects.filter(
                company=company,
                status__in=["pending", "in_progress"],
            ).filter(
                Q(job_site__name__iexact=loc_info["name"]) |
                Q(location__icontains=loc_info["name"])
            ).count()
            # Note: total tasks logic simplified for performance in multi-tenant
            tasks_by_location.append({
                "location": loc_info["name"],
                "total_tasks": task_count, 
                "active_tasks": task_count,
            })
        tasks_by_location.sort(key=lambda x: x["total_tasks"], reverse=True)

        # Hours worked per location (from time logs with clock-in near a known location)
        hours_by_location = []
        logs_30d = TimeLog.objects.filter(
            employee__company=company,
            work_date__gte=thirty_days_ago,
            clock_out__isnull=False,
            clock_in_lat__isnull=False,
            clock_in_lon__isnull=False,
        ).prefetch_related('breaks')
        # Pre-compute hours per log
        log_data = []
        for log in logs_30d:
            try:
                lat = float(log.clock_in_lat)
                lon = float(log.clock_in_lon)
                hrs = log.worked_seconds() / 3600
                log_data.append((lat, lon, hrs))
            except (TypeError, ValueError):
                continue

        def haversine(lat1, lon1, lat2, lon2):
            lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
            return 6371000 * 2 * asin(sqrt(a))  # meters

        for loc_info in known_locations:
            total_hrs = 0
            clock_in_count = 0
            for lat, lon, hrs in log_data:
                dist = haversine(lat, lon, loc_info["lat"], loc_info["lng"])
                if dist <= loc_info["radius"]:
                    total_hrs += hrs
                    clock_in_count += 1
            hours_by_location.append({
                "location": loc_info["name"],
                "hours": round(total_hrs, 1),
                "clock_ins": clock_in_count,
            })
        hours_by_location.sort(key=lambda x: x["hours"], reverse=True)

        # Live clock-in / clock-out data for map dots
        today_logs = TimeLog.objects.filter(
            employee__company=company,
            work_date=today,
            clock_in_lat__isnull=False,
            clock_in_lon__isnull=False,
        )
        today_log_data = []
        for log in today_logs:
            try:
                lat = float(log.clock_in_lat)
                lon = float(log.clock_in_lon)
                is_open = log.clock_out is None
                today_log_data.append((lat, lon, is_open))
            except (TypeError, ValueError):
                continue

        # Location summary for the overall card
        location_summary = []
        for loc_info in known_locations:
            emp_entry = next((e for e in employees_by_location if e["location"] == loc_info["name"]), {})
            task_entry = next((t for t in tasks_by_location if t["location"] == loc_info["name"]), {})
            hrs_entry = next((h for h in hours_by_location if h["location"] == loc_info["name"]), {})

            # Count today's clocked-in (active) vs clocked-out at this location
            clocked_in_now = 0
            clocked_out_today = 0
            for lat, lon, is_open in today_log_data:
                dist = haversine(lat, lon, loc_info["lat"], loc_info["lng"])
                if dist <= loc_info["radius"]:
                    if is_open:
                        clocked_in_now += 1
                    else:
                        clocked_out_today += 1

            location_summary.append({
                "name": loc_info["name"],
                "address": loc_info["address"],
                "lat": loc_info["lat"],
                "lng": loc_info["lng"],
                "employees": emp_entry.get("employees", 0),
                "total_tasks": task_entry.get("total_tasks", 0),
                "active_tasks": task_entry.get("active_tasks", 0),
                "hours": hrs_entry.get("hours", 0),
                "clock_ins": hrs_entry.get("clock_ins", 0),
                "clocked_in_now": clocked_in_now,
                "clocked_out_today": clocked_out_today,
            })
        location_summary.sort(key=lambda x: x["clock_ins"], reverse=True)

        data = {
            "kpi": {
                "total_hours_month": round(total_hours_month, 1),
                "total_hours_week": round(total_hours_week, 1),
                "total_payroll_month": float(total_payroll),
                "employees_total": employees_total,
                "employees_active": employees_active,
                "total_tasks": total_tasks,
                "active_tasks": active_tasks,
                "pending_leaves": pending_leaves,
                "upcoming_shifts": upcoming_shifts,
            },
            "hours_by_employee": hours_by_employee[:10],
            "daily_hours_trend": daily_trend,
            "task_status": task_status_counts,
            "task_categories": task_category_counts,
            "leave_status": leave_status,
            "leave_types": leave_types,
            "attendance_daily": attendance_daily,
            "payroll_trend": payroll_trend,
            "location_analysis": {
                "summary": location_summary,
                "employees_by_location": employees_by_location,
                "tasks_by_location": tasks_by_location,
                "hours_by_location": hours_by_location,
            },
        }
        cache.set(cache_key, data, 60) # Cache for 1 minute
        return Response(data)
