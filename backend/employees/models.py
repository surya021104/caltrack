from django.conf import settings
from django.db import models


class Employee(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employee_profile")
    employee_id = models.CharField(max_length=50)
    phone = models.CharField(max_length=30, blank=True)
    title = models.CharField(max_length=100, blank=True)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hire_date = models.DateField(null=True, blank=True)
    assigned_job_site = models.ForeignKey('time_tracking.JobSite', on_delete=models.SET_NULL, null=True, blank=True, related_name="employees")
    
    # Multi-tenant & Compliance
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="employees")
    country = models.CharField(max_length=2, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)

    # ── Geofence override (Phase 1, Layer 3) ─────────────────────────────
    # When True, the employee may clock in at ANY company location (still
    # subject to per-location geofence radius/polygon). Bypasses the
    # EmployeeLocation assignment filter. Default False keeps existing
    # behaviour where employees must be explicitly assigned.
    allow_all_locations = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "employee_id"], name="unique_employee_per_company")
        ]

    def __str__(self):
        return f"{self.employee_id} - {self.user.get_full_name() or self.user.username}"
