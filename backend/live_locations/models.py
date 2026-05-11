"""
live_locations models — GPS ping log + breach/SOS safety models.

NOTE on naming (Phase 7):
The model class is named ``EmployeeLocation`` for historical reasons. There
is also a ``time_tracking.EmployeeLocation`` model that represents the
employee->Location ASSIGNMENT (a permission), which is a completely
different entity.

Going forward, NEW code should import ``EmployeeLocationPing`` (the alias
defined at the bottom of this module) to disambiguate the two. The
underlying Django model is unchanged — same table name, same migrations,
same FK relationships — so the alias is a pure rename at the Python
import layer with zero database impact.
"""
from django.db import models
from employees.models import Employee
from time_tracking.models import TimeLog


class EmployeeLocation(models.Model):
    """A single GPS ping written while an employee is clocked in."""

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="locations"
    )
    time_log = models.ForeignKey(
        TimeLog,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="locations",
    )

    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)

    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=['employee', 'timestamp']),
            models.Index(fields=['time_log', 'timestamp']),
            models.Index(fields=['time_log']),
        ]

    def __str__(self):
        return f"{self.employee} at {self.timestamp}"


# Phase 7: forward-compatible alias
EmployeeLocationPing = EmployeeLocation


# -- Layer 4: Real-time safety models -----------------------------------------


class GeofenceBreach(models.Model):
    """
    Logged every time an employee's live GPS ping lands outside their
    assigned geofence while they are clocked in.
    """

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="geofence_breaches"
    )
    time_log = models.ForeignKey(
        TimeLog,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="geofence_breaches",
    )

    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)

    # Human-readable name of the location they should be at
    location_name = models.CharField(max_length=255)
    # How far outside the boundary they were (metres)
    distance_meters = models.IntegerField()
    # The configured geofence radius at the time of the breach
    geofence_radius = models.IntegerField()

    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["employee", "timestamp"]),
        ]

    def __str__(self):
        return (
            f"{self.employee} breached {self.location_name} "
            f"by {self.distance_meters}m at {self.timestamp}"
        )


class SOSAlert(models.Model):
    """
    Panic/SOS alert triggered by an employee via the mobile/web app.
    Critical for lone-worker compliance (UK Working Time Regs, etc.).
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESOLVED = "resolved", "Resolved"

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="sos_alerts"
    )
    time_log = models.ForeignKey(
        TimeLog,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sos_alerts",
    )

    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    triggered_at = models.DateTimeField(auto_now_add=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )

    # Who acknowledged the alert and when
    acknowledged_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_sos_alerts",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-triggered_at"]
        indexes = [
            models.Index(fields=["employee", "triggered_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"SOS: {self.employee} at {self.triggered_at} [{self.status}]"
