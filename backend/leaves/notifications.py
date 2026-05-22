"""
Notification helpers for leave events.
Stores notifications in a simple JSON structure on a Notification model.
"""
from django.utils import timezone


def create_early_return_notifications(leave, actual_days, came_back_date, request):
    """
    Create in-app notifications for:
    1. All admin users in the company → employee came back early
    2. The employee themselves → your leave cancellation was processed
    """
    from accounts.models import User

    employee = leave.employee
    emp_name = employee.user.get_full_name() or employee.user.username
    emp_id = employee.employee_id
    requested_days = (leave.end_date - leave.start_date).days + 1
    days_saved = max(0, requested_days - (actual_days or 0))

    # Format date nicely
    def fmt(d):
        if not d:
            return "—"
        from datetime import date
        if isinstance(d, str):
            from datetime import datetime
            d = datetime.strptime(d, "%Y-%m-%d").date()
        return d.strftime("%d %b %Y")

    # ── Notification for admins: employee returned early ──────────────────
    admin_title = f"🏃 {emp_name} returned to work early"
    admin_body = (
        f"{emp_name} ({emp_id}) cancelled their remaining leave and clocked back in on {fmt(came_back_date)}. "
        f"Leave taken: {actual_days or 0} day{'s' if (actual_days or 0) != 1 else ''} of {requested_days} approved. "
        f"{days_saved} day{'s' if days_saved != 1 else ''} left unused."
    )

    # ── Notification for employee: your cancel was processed ─────────────
    emp_title = "✅ Your leave cancellation was processed"
    emp_body = (
        f"Your {leave.leave_type} leave (originally {requested_days} days: {fmt(leave.start_date)} – {fmt(leave.end_date)}) "
        f"has been cancelled. Days you were on leave: {actual_days or 0}. "
        f"You returned on {fmt(came_back_date)}."
    )

    try:
        _save_notification(
            company=leave.company,
            recipient_role="admin",
            employee=employee,
            leave=leave,
            title=admin_title,
            body=admin_body,
            notif_type="early_return",
        )
        _save_notification(
            company=leave.company,
            recipient_role="employee",
            employee=employee,
            leave=leave,
            title=emp_title,
            body=emp_body,
            notif_type="leave_cancelled",
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Notification save failed: {e}")


def _save_notification(company, recipient_role, employee, leave, title, body, notif_type):
    """
    Stores a notification record. Uses a simple JSON table stored in the
    existing Employee.exempt_history field as a fallback if no Notification
    model exists, or creates a proper Notification if available.
    """
    try:
        from .notification_model import Notification
        Notification.objects.create(
            company=company,
            recipient_role=recipient_role,
            employee=employee,
            leave=leave,
            title=title,
            body=body,
            notif_type=notif_type,
        )
    except Exception:
        # Fallback: store in employee exempt_history as a notification entry
        now_str = timezone.now().isoformat()
        entry = {
            "type": "notification",
            "notif_type": notif_type,
            "recipient_role": recipient_role,
            "title": title,
            "body": body,
            "created_at": now_str,
            "read": False,
        }
        history = employee.exempt_history or []
        history.append(entry)
        employee.exempt_history = history
        employee.save(update_fields=["exempt_history"])
