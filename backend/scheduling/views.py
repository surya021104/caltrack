from rest_framework import permissions, viewsets
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from employees.models import Employee

from .models import Shift
from .serializers import ShiftSerializer


class ShiftViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Removed global queryset to force company filtering in get_queryset

    def get_queryset(self):
        if not hasattr(self.request, 'company'):
            return Shift.objects.none()
        qs = Shift.objects.filter(company=self.request.company).select_related("employee", "employee__user").order_by("-shift_start")
        if self.request.user.role == "admin":
            return qs
        employee = Employee.objects.filter(user=self.request.user, company=self.request.company).first()
        if not employee:
            return qs.none()
        return qs.filter(employee=employee)

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        # Validate the employee belongs to the same company
        employee = serializer.validated_data.get('employee')
        if employee and employee.company_id != self.request.company.id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"employee": "This employee does not belong to your company."})

        # Phase 3: defense-in-depth tenant check on Shift.location FK.
        # django-tenants schema isolation already prevents cross-tenant
        # references at the DB level, but we surface a clean validation
        # error if a malformed payload ever points at the wrong tenant.
        location = serializer.validated_data.get('location')
        if location and getattr(location, "company_id", None) and location.company_id != self.request.company.id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"location": "This location does not belong to your company."})

        serializer.save(company=self.request.company)

    def retrieve(self, request, *args, **kwargs):
        shift = self.get_object()
        if request.user.role != "admin" and shift.employee.user_id != request.user.id:
            return Response({"detail": "Not found."}, status=404)
        return super().retrieve(request, *args, **kwargs)
