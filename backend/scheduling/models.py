from django.db import models

from employees.models import Employee


class Shift(models.Model):
    # ── Phase 1: per-shift enforcement override ──────────────────────────
    # 'inherit' = use Company.shift_enforcement_mode (default)
    # 'block' / 'warn' / 'off' = override the company default for this shift
    ENFORCEMENT_OVERRIDES = [
        ("inherit", "Inherit from company"),
        ("block", "Block clock-in"),
        ("warn", "Allow with warning"),
        ("off", "No enforcement"),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="shifts")
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="shifts", null=True, blank=True)
    shift_start = models.DateTimeField()
    shift_end = models.DateTimeField()
    title = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    # ── Shift-Location enforcement (Phase 1, Layer 3) ────────────────────
    # When set, the employee MUST clock in at this location for the shift.
    # Mismatch behaviour is governed by enforcement_override (or company default).
    location = models.ForeignKey(
        'time_tracking.Location',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="shifts",
    )
    enforcement_override = models.CharField(
        max_length=10,
        choices=ENFORCEMENT_OVERRIDES,
        default="inherit",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["employee", "shift_start"]),
        ]

    def __str__(self):
        return f"{self.employee.employee_id}: {self.shift_start} - {self.shift_end}"
