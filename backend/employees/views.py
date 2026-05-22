from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsAdminRole, is_admin_role

from .models import Employee
from .serializers import EmployeeCreateSerializer, EmployeeSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        if not hasattr(self.request, 'company'):
            return Employee.objects.none()
        return Employee.objects.select_related("user").filter(company=self.request.company).order_by("employee_id")

    def get_permissions(self):
        if self.action in {"list", "create", "update", "partial_update", "destroy", "history"}:
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return EmployeeCreateSerializer
        return EmployeeSerializer

    def retrieve(self, request, *args, **kwargs):
        employee = self.get_object()
        if not is_admin_role(request.user) and employee.user_id != request.user.id:
            return Response({"detail": "Not found."}, status=404)
        return super().retrieve(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        employee = Employee.objects.select_related("user").filter(user=request.user).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        return Response(EmployeeSerializer(employee).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        """
        Returns a rich history profile for a single employee:
          - leave_history: all leave requests with accurate day count
          - task_stats: completed / in_progress / pending / cancelled / upcoming
          - task_history: last 20 tasks
          - performance: placeholder ratings for feedback, functionality, attitude, self_respect
        """
        from leaves.models import LeaveRequest
        from tasks.models import Task
        from time_tracking.models import TimeLog

        employee = self.get_object()
        today = timezone.localdate()

        # ── Leave History ──────────────────────────────────────────────────
        leaves_qs = LeaveRequest.objects.filter(employee=employee).select_related("approved_by").order_by("-start_date")
        leave_history = []
        for lv in leaves_qs:
            requested_days = (lv.end_date - lv.start_date).days + 1
            actual_days = None
            actual_end_date = None
            returned_early = False
            early_return_date = None

            if lv.status == LeaveRequest.Status.APPROVED:
                # Check if employee clocked in during the approved leave window
                # → earliest clock-in date within leave window = actual return date
                clock_in_during_leave = TimeLog.objects.filter(
                    employee=employee,
                    work_date__gte=lv.start_date,
                    work_date__lte=lv.end_date,
                    clock_in__isnull=False,
                ).order_by("work_date").first()

                if clock_in_during_leave:
                    # Employee returned early on this date
                    early_return_date = str(clock_in_during_leave.work_date)
                    # Days actually on leave = from start_date up to (but not including) return date
                    actual_days = max(0, (clock_in_during_leave.work_date - lv.start_date).days)
                    actual_end_date = str(clock_in_during_leave.work_date - timezone.timedelta(days=1)) if actual_days > 0 else str(lv.start_date)
                    returned_early = True
                else:
                    # No early return — cap at today if still ongoing
                    effective_end = min(lv.end_date, today)
                    actual_days = max(0, (effective_end - lv.start_date).days + 1)
                    actual_end_date = str(effective_end)
                    returned_early = False

            leave_history.append({
                "id": lv.id,
                "leave_type": lv.leave_type,
                "status": lv.status,
                "start_date": str(lv.start_date),
                "end_date": str(lv.end_date),
                "actual_end_date": actual_end_date,
                "requested_days": requested_days,
                "actual_days_taken": actual_days,
                "days_saved": max(0, requested_days - actual_days) if actual_days is not None else None,
                "returned_early": returned_early,
                "early_return_date": early_return_date,
                "reason": lv.reason,
                "paid": lv.paid,
                "approved_by": lv.approved_by.get_full_name() or lv.approved_by.username if lv.approved_by else None,
                "decision_at": lv.decision_at.isoformat() if lv.decision_at else None,
                "decision_date": str(lv.decision_at.date()) if lv.decision_at else None,
                "decision_time": lv.decision_at.strftime("%I:%M %p") if lv.decision_at else None,
                "created_at": lv.created_at.isoformat(),
                "submitted_date": str(lv.created_at.date()),
                "submitted_time": lv.created_at.strftime("%I:%M %p"),
            })

        # ── Leave Summary ──────────────────────────────────────────────────
        approved_leaves = [l for l in leave_history if l["status"] == "approved"]
        total_approved_days = sum(l["actual_days_taken"] or 0 for l in approved_leaves)
        total_requested_days = sum(l["requested_days"] for l in approved_leaves)

        leave_summary = {
            "total_requests": len(leave_history),
            "approved": len(approved_leaves),
            "pending": sum(1 for l in leave_history if l["status"] == "pending"),
            "rejected": sum(1 for l in leave_history if l["status"] == "rejected"),
            "cancelled": sum(1 for l in leave_history if l["status"] == "cancelled"),
            "total_approved_days": total_approved_days,
            "total_requested_days": total_requested_days,
            "days_returned_early": max(0, total_requested_days - total_approved_days),
        }

        # ── Task Stats ─────────────────────────────────────────────────────
        all_tasks = Task.objects.filter(assigned_to=employee.user)
        task_stats = {
            "total": all_tasks.count(),
            "completed": all_tasks.filter(status=Task.Status.COMPLETED).count(),
            "in_progress": all_tasks.filter(status=Task.Status.IN_PROGRESS).count(),
            "pending": all_tasks.filter(status=Task.Status.PENDING).count(),
            "cancelled": all_tasks.filter(status=Task.Status.CANCELLED).count(),
            "upcoming": all_tasks.filter(status=Task.Status.PENDING, due_date__gte=today).count(),
            "overdue": all_tasks.filter(
                status__in=[Task.Status.PENDING, Task.Status.IN_PROGRESS],
                due_date__lt=today
            ).count(),
            "total_billed_hours": float(
                all_tasks.filter(status=Task.Status.COMPLETED)
                .aggregate(total=Sum("billed_hours"))["total"] or 0
            ),
        }

        # ── Recent Task History (last 20) ─────────────────────────────────
        recent_tasks = all_tasks.order_by("-created_at")[:20]
        task_history = []
        for t in recent_tasks:
            task_history.append({
                "id": t.id,
                "title": t.title,
                "category": t.category,
                "priority": t.priority,
                "status": t.status,
                "acceptance_status": t.acceptance_status,
                "due_date": str(t.due_date),
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "billed_hours": float(t.billed_hours) if t.billed_hours else None,
                "location": t.location or t.job_address,
                "client_name": t.client_name,
            })

        # ── Performance Ratings ────────────────────────────────────────────
        # These are stored in employee.exempt_history (JSON) as performance entries
        # or default to None if not yet recorded. Future: could be a separate model.
        perf_entries = [
            e for e in (employee.exempt_history or [])
            if e.get("type") == "performance"
        ]
        latest_perf = perf_entries[-1] if perf_entries else {}
        performance = {
            "feedback_rate": latest_perf.get("feedback_rate"),        # 1-5
            "functionality": latest_perf.get("functionality"),        # 1-5
            "attitude": latest_perf.get("attitude"),                  # 1-5
            "self_respect": latest_perf.get("self_respect"),          # 1-5
            "overall": latest_perf.get("overall"),                    # 1-5
            "notes": latest_perf.get("notes", ""),
            "rated_at": latest_perf.get("rated_at"),
            "history": perf_entries,
        }

        return Response({
            "employee": {
                "id": employee.id,
                "employee_id": employee.employee_id,
                "full_name": employee.user.get_full_name() or employee.user.username,
                "username": employee.user.username,
                "email": employee.user.email,
                "title": employee.title,
                "hire_date": str(employee.hire_date) if employee.hire_date else None,
                "is_active": employee.is_active,
                "hourly_rate": float(employee.hourly_rate),
                "country": employee.country,
            },
            "leave_summary": leave_summary,
            "leave_history": leave_history,
            "task_stats": task_stats,
            "task_history": task_history,
            "performance": performance,
        })
