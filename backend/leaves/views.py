from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole, is_admin_role
from employees.models import Employee

from .models import LeaveRequest
from .serializers import LeaveRequestCreateSerializer, LeaveRequestSerializer


class LeaveRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if not hasattr(self.request, 'company'):
            return LeaveRequest.objects.none()
        qs = LeaveRequest.objects.filter(company=self.request.company).select_related(
            "employee", "employee__user", "approved_by"
        ).order_by("-created_at")
        if is_admin_role(self.request.user):
            return qs
        employee = Employee.objects.filter(user=self.request.user, company=self.request.company).first()
        if not employee:
            return qs.none()
        return qs.filter(employee=employee)

    def get_serializer_class(self):
        if self.action == "create":
            return LeaveRequestCreateSerializer
        return LeaveRequestSerializer

    def perform_create(self, serializer):
        employee = Employee.objects.filter(user=self.request.user, company=self.request.company).first()
        if not employee:
            raise ValidationError({"detail": "Employee profile not found."})
        serializer.save(employee=employee, company=self.request.company)

    def perform_update(self, serializer):
        instance = serializer.instance
        if not is_admin_role(self.request.user):
            if instance.status not in [
                LeaveRequest.Status.REWORK,
                LeaveRequest.Status.CANCELLED,
                LeaveRequest.Status.PENDING,
                LeaveRequest.Status.PENDING_CANCEL,
            ]:
                raise ValidationError({"detail": "Cannot edit this leave request in its current status."})
            serializer.save(status=LeaveRequest.Status.PENDING, approved_by=None, decision_at=None)
        else:
            serializer.save()

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAdminRole])
    def approve(self, request, pk=None):
        leave = self.get_object()
        leave.status = LeaveRequest.Status.APPROVED
        leave.approved_by = request.user
        leave.decision_at = timezone.now()
        leave.save(update_fields=["status", "approved_by", "decision_at", "updated_at"])
        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAdminRole])
    def reject(self, request, pk=None):
        leave = self.get_object()
        leave.status = LeaveRequest.Status.REJECTED
        leave.approved_by = request.user
        leave.decision_at = timezone.now()
        leave.save(update_fields=["status", "approved_by", "decision_at", "updated_at"])
        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def rework(self, request, pk=None):
        leave = self.get_object()
        leave.status = LeaveRequest.Status.REWORK
        leave.save(update_fields=["status", "updated_at"])
        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def cancel(self, request, pk=None):
        leave = self.get_object()
        today = timezone.localdate()
        now = timezone.now()

        actual_days = None
        came_back_date = str(today)

        if leave.status == LeaveRequest.Status.APPROVED and leave.start_date <= today:
            actual_days = max(0, (today - leave.start_date).days)

        if not is_admin_role(request.user) and leave.status == LeaveRequest.Status.APPROVED:
            leave.status = LeaveRequest.Status.PENDING_CANCEL
        else:
            leave.status = LeaveRequest.Status.CANCELLED
            leave.decision_at = now
            leave.approved_by = request.user

        leave.save(update_fields=["status", "approved_by", "decision_at", "updated_at"])

        try:
            from .notifications import create_early_return_notifications
            create_early_return_notifications(leave, actual_days, came_back_date, request)
        except Exception:
            pass

        return Response({
            **LeaveRequestSerializer(leave).data,
            "actual_days_taken": actual_days,
            "came_back_date": came_back_date,
        })


class NotificationsView(APIView):
    """
    GET  /api/leaves/notifications/      → list my in-app notifications
    POST /api/leaves/notifications/      → mark all as read
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        is_admin = is_admin_role(request.user)
        if is_admin:
            all_employees = Employee.objects.filter(
                company=request.company
            ).select_related("user") if hasattr(request, 'company') else Employee.objects.none()
            notifs = []
            for emp in all_employees:
                for entry in (emp.exempt_history or []):
                    if entry.get("type") == "notification" and entry.get("recipient_role") == "admin":
                        notifs.append({
                            **entry,
                            "employee_id": emp.employee_id,
                            "employee_name": emp.user.get_full_name() or emp.user.username,
                        })
            notifs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return Response(notifs[:50])
        else:
            emp = Employee.objects.filter(user=request.user).first()
            if not emp:
                return Response([])
            notifs = [
                {**e, "employee_id": emp.employee_id}
                for e in (emp.exempt_history or [])
                if e.get("type") == "notification" and e.get("recipient_role") == "employee"
            ]
            notifs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return Response(notifs[:50])

    def post(self, request):
        """Mark all notifications as read."""
        is_admin = is_admin_role(request.user)
        if is_admin:
            all_employees = Employee.objects.filter(
                company=request.company
            ) if hasattr(request, 'company') else Employee.objects.none()
            for emp in all_employees:
                changed = False
                for e in (emp.exempt_history or []):
                    if e.get("type") == "notification" and e.get("recipient_role") == "admin" and not e.get("read"):
                        e["read"] = True
                        changed = True
                if changed:
                    emp.save(update_fields=["exempt_history"])
        else:
            emp = Employee.objects.filter(user=request.user).first()
            if emp:
                changed = False
                for e in (emp.exempt_history or []):
                    if e.get("type") == "notification" and e.get("recipient_role") == "employee" and not e.get("read"):
                        e["read"] = True
                        changed = True
                if changed:
                    emp.save(update_fields=["exempt_history"])
        return Response({"status": "ok"})
