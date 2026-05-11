"""
compliance/signals.py

Django signals that write immutable AuditLog entries whenever a TimeLog
is created, edited, or deleted.
"""

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

from time_tracking.models import TimeLog
from .models import AuditLog


def _timelog_snapshot(log):
    """Serialize a TimeLog to a plain dict for before/after capture."""
    return {
        "id": log.pk,
        "employee_id": log.employee_id,
        "work_date": str(log.work_date),
        "clock_in": log.clock_in.isoformat() if log.clock_in else None,
        "clock_out": log.clock_out.isoformat() if log.clock_out else None,
        "status": log.status,
        "manual_hours_correction": str(log.manual_hours_correction) if log.manual_hours_correction else None,
        "admin_notes": log.admin_notes,
        "geofence_passed": log.geofence_passed,
        "admin_override_used": log.admin_override_used,
    }


@receiver(post_save, sender=TimeLog)
def timelog_post_save(sender, instance, created, **kwargs):
    """Write CREATE or EDIT audit entries. Skips if company not available."""
    try:
        company = instance.employee.company
    except Exception:
        return

    action = AuditLog.Action.CREATE if created else AuditLog.Action.EDIT
    after = _timelog_snapshot(instance)

    AuditLog(
        company=company,
        time_log_id=instance.pk,
        employee=instance.employee,
        action=action,
        after_state=after,
        before_state=None if created else getattr(instance, "_pre_save_state", None),
    ).save()


@receiver(pre_delete, sender=TimeLog)
def timelog_pre_delete(sender, instance, **kwargs):
    """Write DELETE audit entry before the row is removed."""
    try:
        company = instance.employee.company
    except Exception:
        return

    AuditLog(
        company=company,
        time_log_id=instance.pk,
        employee=instance.employee,
        action=AuditLog.Action.DELETE,
        before_state=_timelog_snapshot(instance),
        after_state=None,
    ).save()
