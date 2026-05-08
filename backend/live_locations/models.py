"""
live_locations models — GPS ping log for employees on active shifts.

NOTE on naming (Phase 7):
The model class is named ``EmployeeLocation`` for historical reasons. There
is also a ``time_tracking.EmployeeLocation`` model that represents the
employee→Location ASSIGNMENT (a permission), which is a completely
different entity.

Going forward, NEW code should import ``EmployeeLocationPing`` (the alias
defined at the bottom of this module) to disambiguate the two. The
underlying Django model is unchanged — same table name, same migrations,
same FK relationships — so the alias is a pure rename at the Python
import layer with zero database impact.

A future change can promote ``EmployeeLocationPing`` to be the canonical
class name (with a SeparateDatabaseAndState migration that pins
``Meta.db_table`` to the existing table). That is intentionally deferred
because the full rename touches every schema in a multi-tenant
deployment.
"""
from django.db import models
from employees.models import Employee
from time_tracking.models import TimeLog


class EmployeeLocation(models.Model):
    """A single GPS ping written while an employee is clocked in.

    .. note::
       Prefer importing this as ``EmployeeLocationPing`` for new code so
       it doesn't visually collide with ``time_tracking.EmployeeLocation``
       (the assignment model).
    """
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="locations")
    time_log = models.ForeignKey(TimeLog, on_delete=models.SET_NULL, null=True, blank=True, related_name="locations")

    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)

    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['employee', 'timestamp']),
            models.Index(fields=['time_log']),
        ]

    def __str__(self):
        return f"{self.employee} at {self.timestamp}"


# ── Phase 7: forward-compatible alias ────────────────────────────────────────
# New code should import EmployeeLocationPing. Old imports of
# EmployeeLocation continue to work unchanged.
EmployeeLocationPing = EmployeeLocation
