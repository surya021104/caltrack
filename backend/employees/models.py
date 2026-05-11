from django.conf import settings
from django.db import models


class Employee(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employee_profile")
    employee_id = models.CharField(max_length=50)
    phone = models.CharField(max_length=30, blank=True)
    title = models.CharField(max_length=100, blank=True)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hire_date = models.DateField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    assigned_job_site = models.ForeignKey('time_tracking.JobSite', on_delete=models.SET_NULL, null=True, blank=True, related_name="employees")

    # Multi-tenant & Compliance
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="employees")
    country = models.CharField(max_length=2, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)

    # ── Geofence override (Phase 1, Layer 3) ─────────────────────────────
    allow_all_locations = models.BooleanField(default=False)

    # ── US FLSA Exempt Status ─────────────────────────────────────────────
    class ExemptStatus(models.TextChoices):
        NON_EXEMPT = "non_exempt", "Non-Exempt (eligible for OT)"
        EXEMPT = "exempt", "Exempt (not eligible for OT)"
        PENDING = "pending", "Pending Classification"

    exempt_status = models.CharField(
        max_length=20,
        choices=ExemptStatus.choices,
        default=ExemptStatus.NON_EXEMPT,
    )
    # JSON list of {status, changed_at, changed_by, reason, duties_category}
    exempt_history = models.JSONField(default=list, blank=True)

    # Duties test result (executive / administrative / professional / computer / outside_sales)
    flsa_duties_category = models.CharField(max_length=30, blank=True, null=True)

    # Weekly salary (for FLSA exempt threshold check: $844/week)
    weekly_salary = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # ── UK Payroll Fields ─────────────────────────────────────────────────
    uk_tax_code = models.CharField(max_length=20, blank=True, null=True, default="1257L")
    uk_ni_category = models.CharField(max_length=1, blank=True, null=True, default="A")
    # Rolled-up holiday pay: holiday entitlement paid as % on each payslip
    rolled_up_holiday_pay = models.BooleanField(default=False)
    # WTR 48-hr opt-out agreement active?
    wtr_opt_out_active = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "employee_id"], name="unique_employee_per_company")
        ]

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        from django.utils import timezone
        today = timezone.localdate()
        dob = self.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    @property
    def is_flsa_exempt(self):
        return self.exempt_status == self.ExemptStatus.EXEMPT

    def __str__(self):
        return f"{self.employee_id} - {self.user.get_full_name() or self.user.username}"
