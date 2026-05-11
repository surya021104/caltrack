from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from employees.models import Employee


class PayrollPeriod(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="payroll_periods", null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        # Enforce uniqueness at the application level (MongoDB doesn't support DB-level constraints)
        filters = {"start_date": self.start_date, "end_date": self.end_date}
        if self.company_id:
            filters["company"] = self.company
        qs = PayrollPeriod.objects.filter(**filters)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError("A payroll period with these dates already exists.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.start_date} - {self.end_date}"


class PayrollRecord(models.Model):
    period = models.ForeignKey(PayrollPeriod, on_delete=models.CASCADE, related_name="records")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="payroll_records")
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="payroll_records", null=True, blank=True)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)

    regular_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    # CA/AK daily OT breakdown
    daily_ot_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    double_time_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    paid_leave_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    unpaid_leave_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    gross_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # UK PAYE deductions
    uk_income_tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    uk_employee_ni = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    uk_employer_ni = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    uk_tax_code = models.CharField(max_length=20, blank=True, null=True)
    uk_ni_category = models.CharField(max_length=1, blank=True, null=True)

    # Holiday accrual this period (UK WTR)
    holiday_hours_accrued = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Compliance flags
    region = models.CharField(max_length=50, blank=True, null=True)  # e.g. "US FLSA (CA)"
    is_exempt = models.BooleanField(default=False)  # FLSA exempt?
    wage_floor_compliant = models.BooleanField(default=True)

    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="generated_payroll"
    )
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["employee", "generated_at"]),
        ]

    def clean(self):
        # Enforce uniqueness at the application level
        qs = PayrollRecord.objects.filter(period=self.period, employee=self.employee)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError("A payroll record for this employee and period already exists.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_id} ({self.period})"
