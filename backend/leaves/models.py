from django.conf import settings
from django.db import models

from employees.models import Employee


class LeaveRequest(models.Model):

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        REWORK = "rework", "Rework"
        PENDING_CANCEL = "pending_cancel", "Pending Cancellation"

    class LeaveType(models.TextChoices):
        VACATION = "vacation", "Vacation"
        SICK = "sick", "Sick"
        UNPAID = "unpaid", "Unpaid"

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="leave_requests")
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="leave_requests", null=True, blank=True)
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True)
    paid = models.BooleanField(default=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_leaves"
    )
    decision_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.leave_type == self.LeaveType.UNPAID:
            self.paid = False
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_id}: {self.start_date} - {self.end_date} ({self.status})"
