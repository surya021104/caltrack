"""
compliance/management/commands/send_rtw_alerts.py

Django management command to send Right-to-Work expiry email alerts.

Usage:
    python manage.py send_rtw_alerts
    python manage.py send_rtw_alerts --dry-run
    python manage.py send_rtw_alerts --days 60 30 7

Designed to be run daily via cron / scheduled task:
    0 8 * * * cd /app && python manage.py send_rtw_alerts >> /var/log/rtw_alerts.log 2>&1

Sends emails for documents expiring in:
  - 60 days (first warning)
  - 30 days (second warning)
  - 7 days  (urgent warning)

Each alert is sent only once per threshold (tracked on the RightToWork model).
"""

from datetime import date, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand

from compliance.models import RightToWork


THRESHOLDS = [
    (60, "alert_sent_60d", "60-day advance"),
    (30, "alert_sent_30d", "30-day advance"),
    (7, "alert_sent_7d", "7-day urgent"),
]


class Command(BaseCommand):
    help = "Send Right-to-Work expiry email alerts (60/30/7 days before expiry)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print alerts that would be sent without actually sending emails or updating flags.",
        )
        parser.add_argument(
            "--days",
            nargs="+",
            type=int,
            default=[60, 30, 7],
            help="Threshold days to check (default: 60 30 7).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        day_thresholds = options["days"]
        today = date.today()

        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "compliance@quicktims.com")

        active_thresholds = [(d, flag, label) for d, flag, label in THRESHOLDS if d in day_thresholds]

        total_sent = 0
        total_failed = 0

        for days, flag_field, label in active_thresholds:
            target_date = today + timedelta(days=days)

            docs = RightToWork.objects.filter(
                expiry_date__date=target_date,
                status=RightToWork.VerificationStatus.VERIFIED,
                **{flag_field: False},
            ).select_related("employee", "employee__user", "employee__company")

            for doc in docs:
                emp = doc.employee
                emp_name = emp.user.get_full_name() or emp.user.username
                company_name = getattr(emp.company, "name", "Your Organisation")

                # Build recipient list — company admins
                from accounts.models import User
                admin_emails = list(
                    User.objects.filter(
                        company=emp.company,
                        role="admin",
                        is_active=True,
                    ).values_list("email", flat=True)
                )
                if not admin_emails:
                    admin_emails = [from_email]

                subject = (
                    f"[{label.upper()}] RTW Document Expiring {days} Days — "
                    f"{emp_name} ({emp.employee_id})"
                )
                body = (
                    f"RIGHT TO WORK DOCUMENT EXPIRY NOTICE\n"
                    f"{'=' * 50}\n\n"
                    f"Organisation: {company_name}\n"
                    f"Employee:     {emp_name} ({emp.employee_id})\n"
                    f"Document:     {doc.get_document_type_display()}\n"
                    f"Reference:    {doc.document_reference or 'N/A'}\n"
                    f"Expiry Date:  {doc.expiry_date.date() if hasattr(doc.expiry_date, 'date') else doc.expiry_date}\n"
                    f"Days Until Expiry: {days}\n\n"
                    f"{'─' * 50}\n"
                    f"ACTION REQUIRED:\n"
                    f"Please arrange re-verification of this employee's right to work "
                    f"before the document expires.\n\n"
                    f"Failing to verify the right to work of an employee is a criminal offence "
                    f"under the Immigration, Asylum and Nationality Act 2006, carrying a civil "
                    f"penalty of up to £20,000 per illegal worker.\n\n"
                    f"Log into QuickTIMS to upload the renewed document and mark it as verified.\n"
                    f"{'─' * 50}\n\n"
                    f"This is an automated alert from QuickTIMS Compliance System.\n"
                    f"Alert threshold: {label} ({days} days)\n"
                    f"Alert sent: {today.isoformat()}\n"
                )

                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            f"[DRY RUN] Would send {label} alert for {emp_name} "
                            f"(expires {target_date}) to: {', '.join(admin_emails)}"
                        )
                    )
                    continue

                try:
                    send_mail(subject, body, from_email, admin_emails, fail_silently=False)
                    setattr(doc, flag_field, True)
                    doc.save(update_fields=[flag_field])
                    total_sent += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ Sent {label} alert for {emp_name} "
                            f"({emp.employee_id}) — expires {target_date}"
                        )
                    )
                except Exception as exc:
                    total_failed += 1
                    self.stderr.write(
                        self.style.ERROR(
                            f"  ✗ Failed to send alert for {emp_name}: {exc}"
                        )
                    )

        if dry_run:
            self.stdout.write(self.style.SUCCESS("[DRY RUN complete — no emails sent]"))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nRTW alert run complete: {total_sent} sent, {total_failed} failed. "
                    f"Date: {today}"
                )
            )
