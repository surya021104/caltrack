"""
compliance/models.py

Core compliance models for QuickTIMS:
  - AuditLog         : Immutable trail of every TimeLog edit/delete
  - HolidayAccrual   : UK WTR Reg 13 + Reg 13A holiday pots
  - RightToWork      : UK right-to-work document tracking
  - OvertimeAlert    : Persisted OT risk flags per employee-week
  - WTROptOut        : UK 48-hr opt-out agreements
  - BreakAttestation : Employee "I took my break" confirmation
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from employees.models import Employee


# ---------------------------------------------------------------------------
# Immutable Audit Log
# ---------------------------------------------------------------------------

class AuditLog(models.Model):
    """
    Immutable record of every change to a TimeLog.
    Records are never updated or deleted — they represent a permanent history.
    3-year retention enforced by retention_until field.
    """

    class Action(models.TextChoices):
        CREATE = "create", "Created"
        EDIT = "edit", "Edited"
        DELETE = "delete", "Deleted"
        APPROVE = "approve", "Approved"
        REJECT = "reject", "Rejected"
        SUBMIT = "submit", "Submitted"
        CLOCK_IN = "clock_in", "Clock In"
        CLOCK_OUT = "clock_out", "Clock Out"

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    # Soft reference so log survives deletion
    time_log_id = models.IntegerField(db_index=True)
    employee = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="audit_logs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="audit_actions",
    )

    action = models.CharField(max_length=20, choices=Action.choices)
    reason = models.TextField(blank=True)  # required for admin edits

    # Before/after snapshot (JSON)
    before_state = models.JSONField(null=True, blank=True)
    after_state = models.JSONField(null=True, blank=True)

    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    # 3-year DOL/WTR retention
    retention_until = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["company", "time_log_id"]),
            models.Index(fields=["employee", "timestamp"]),
        ]

    def save(self, *args, **kwargs):
        if not self.retention_until:
            from datetime import date
            from dateutil.relativedelta import relativedelta
            self.retention_until = date.today() + relativedelta(years=3)
        # Prevent updates — audit logs are write-once
        if self.pk:
            raise ValueError("AuditLog entries are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def __str__(self):
        return "AuditLog #{} — {} on TimeLog #{} by {}".format(
            self.pk, self.action, self.time_log_id,
            self.actor.username if self.actor else "system"
        )


# ---------------------------------------------------------------------------
# UK Holiday Accrual
# ---------------------------------------------------------------------------

class HolidayAccrual(models.Model):
    """
    Tracks UK WTR Reg 13 (4wk) and Reg 13A (1.6wk) holiday pots per employee per leave year.
    Holiday pay = 52-week average including OT and commission.
    """

    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, related_name="holiday_accruals"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="holiday_accruals"
    )
    leave_year_start = models.DateField()   # e.g. 2024-04-01
    leave_year_end = models.DateField()     # e.g. 2025-03-31

    # Hours in each pot
    reg13_hours_accrued = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    reg13a_hours_accrued = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    # Hours taken from each pot
    reg13_hours_taken = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    reg13a_hours_taken = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    # Carry-over from previous year (max 8 days standard)
    carry_over_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    # 52-week rolling average for holiday pay rate (GBP/hr)
    average_hourly_rate = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)

    # Rolled-up holiday pay toggle per employee
    rolled_up_pay_enabled = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("company", "employee", "leave_year_start")

    @property
    def reg13_hours_remaining(self):
        return max(0, float(self.reg13_hours_accrued) + float(self.carry_over_hours) - float(self.reg13_hours_taken))

    @property
    def reg13a_hours_remaining(self):
        return max(0, float(self.reg13a_hours_accrued) - float(self.reg13a_hours_taken))

    @property
    def total_hours_remaining(self):
        return round(self.reg13_hours_remaining + self.reg13a_hours_remaining, 2)

    def __str__(self):
        return "HolidayAccrual: {} | {} ({} - {})".format(
            self.employee.employee_id, self.company.company_name,
            self.leave_year_start, self.leave_year_end
        )


# ---------------------------------------------------------------------------
# UK Right to Work
# ---------------------------------------------------------------------------

class RightToWork(models.Model):
    """
    Tracks UK right-to-work documents per employee.
    Supports expiry tracking with automated reminder flags.
    """

    class DocumentType(models.TextChoices):
        PASSPORT = "passport", "Passport"
        BRP = "brp", "Biometric Residence Permit (BRP)"
        SHARE_CODE = "share_code", "Share Code"
        EU_SETTLEMENT = "eu_settlement", "EU Settlement Scheme"
        BIRTH_CERT = "birth_cert", "Birth Certificate + NI"
        OTHER = "other", "Other"

    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending Verification"
        VERIFIED = "verified", "Verified"
        EXPIRED = "expired", "Expired"
        REJECTED = "rejected", "Rejected"

    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, related_name="rtw_records"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="rtw_records"
    )
    document_type = models.CharField(max_length=30, choices=DocumentType.choices)
    document_number = models.CharField(max_length=100, blank=True)
    document_file = models.FileField(upload_to="rtw_documents/", null=True, blank=True)

    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)  # None = indefinite right to work

    status = models.CharField(
        max_length=20, choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="rtw_verifications"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    # Alert tracking — days at which reminder emails were sent
    alert_sent_60d = models.BooleanField(default=False)
    alert_sent_30d = models.BooleanField(default=False)
    alert_sent_7d = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def days_until_expiry(self):
        if not self.expiry_date:
            return None
        return (self.expiry_date - timezone.localdate()).days

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        return timezone.localdate() > self.expiry_date

    def __str__(self):
        return "RTW: {} — {} ({})".format(
            self.employee.employee_id, self.document_type, self.status
        )


# ---------------------------------------------------------------------------
# UK 48-Hour WTR Opt-Out
# ---------------------------------------------------------------------------

class WTROptOut(models.Model):
    """
    Records an employee's opt-out from the 48-hour weekly limit (UK WTR Article 22).
    The employee may withdraw the opt-out at any time with 7 days notice.
    """

    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, related_name="wtr_opt_outs"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="wtr_opt_outs"
    )
    agreement_file = models.FileField(upload_to="wtr_optouts/", null=True, blank=True)
    signed_on = models.DateField()
    is_active = models.BooleanField(default=True)
    withdrawn_on = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-signed_on"]

    def __str__(self):
        status = "Active" if self.is_active else "Withdrawn"
        return "WTR Opt-Out: {} ({})".format(self.employee.employee_id, status)


# ---------------------------------------------------------------------------
# Overtime Alert
# ---------------------------------------------------------------------------

class OvertimeAlert(models.Model):
    """
    Persisted OT risk flag for an employee in a given ISO week.
    Allows the admin dashboard to show real-time OT risk banners.
    """

    class AlertType(models.TextChoices):
        APPROACHING_40 = "approaching_40", "Approaching 40hrs (US)"
        EXCEEDED_40 = "exceeded_40", "Exceeded 40hrs — OT Pay Required (US)"
        DAILY_OT_CA = "daily_ot_ca", "Daily OT (CA >8hrs)"
        DOUBLE_TIME_CA = "double_time_ca", "Double Time (CA >12hrs)"
        DAILY_OT_AK = "daily_ot_ak", "Daily OT (AK >8hrs)"
        APPROACHING_48_UK = "approaching_48_uk", "Approaching 48hr Limit (UK WTR)"
        EXCEEDED_48_UK = "exceeded_48_uk", "17-week avg exceeds 48hr limit (UK WTR)"

    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, related_name="overtime_alerts"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="overtime_alerts"
    )
    iso_year = models.IntegerField()
    iso_week = models.IntegerField()
    alert_type = models.CharField(max_length=30, choices=AlertType.choices)
    hours_worked = models.DecimalField(max_digits=6, decimal_places=2)
    threshold_hours = models.DecimalField(max_digits=6, decimal_places=2)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("company", "employee", "iso_year", "iso_week", "alert_type")
        ordering = ["-iso_year", "-iso_week"]

    def __str__(self):
        return "OTAlert: {} Wk{}/{} — {}".format(
            self.employee.employee_id, self.iso_week, self.iso_year, self.alert_type
        )


# ---------------------------------------------------------------------------
# Break Attestation
# ---------------------------------------------------------------------------

class BreakAttestation(models.Model):
    """
    Employee confirmation that they took their legally required break.
    Linked to a TimeLog session.
    """

    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, related_name="break_attestations"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="break_attestations"
    )
    time_log = models.ForeignKey(
        "time_tracking.TimeLog", on_delete=models.CASCADE, related_name="break_attestations"
    )
    attested_at = models.DateTimeField(default=timezone.now)
    break_taken = models.BooleanField(default=True)
    notes = models.TextField(blank=True)  # optional explanation if break not taken

    class Meta:
        unique_together = ("time_log", "employee")

    def __str__(self):
        return "BreakAttestation: {} — TimeLog #{} — taken={}".format(
            self.employee.employee_id, self.time_log_id, self.break_taken
        )
