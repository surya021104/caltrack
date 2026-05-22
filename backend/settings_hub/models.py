import secrets
import hashlib
from django.db import models
from django.conf import settings
from django.utils import timezone


AUTH_USER_MODEL = settings.AUTH_USER_MODEL


class NotificationPreference(models.Model):
    user = models.OneToOneField(AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_prefs")

    # Email channel
    email_security_alerts = models.BooleanField(default=True)
    email_login_alerts = models.BooleanField(default=True)
    email_leave_updates = models.BooleanField(default=True)
    email_payroll_ready = models.BooleanField(default=True)
    email_task_assigned = models.BooleanField(default=True)
    email_weekly_digest = models.BooleanField(default=False)
    email_product_updates = models.BooleanField(default=False)
    email_shift_reminders = models.BooleanField(default=True)

    # In-app channel
    inapp_security_alerts = models.BooleanField(default=True)
    inapp_leave_updates = models.BooleanField(default=True)
    inapp_task_assigned = models.BooleanField(default=True)
    inapp_clock_reminders = models.BooleanField(default=True)
    inapp_announcements = models.BooleanField(default=True)
    inapp_payroll_ready = models.BooleanField(default=True)

    # SMS channel
    sms_security_alerts = models.BooleanField(default=False)
    sms_clock_reminders = models.BooleanField(default=False)
    sms_leave_updates = models.BooleanField(default=False)
    sms_shift_reminders = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Notification Preference"


class LoginSession(models.Model):
    DEVICE_CHOICES = [("browser", "Browser"), ("mobile", "Mobile"), ("api", "API")]

    user = models.ForeignKey(AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="login_sessions")
    session_key = models.CharField(max_length=64, unique=True)
    device_type = models.CharField(max_length=20, choices=DEVICE_CHOICES, default="browser")
    device_name = models.CharField(max_length=200, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    last_active = models.DateTimeField(default=timezone.now)
    is_current = models.BooleanField(default=False)
    revoked = models.BooleanField(default=False)

    class Meta:
        ordering = ["-last_active"]


class LoginHistory(models.Model):
    STATUS_CHOICES = [("success", "Success"), ("failed", "Failed"), ("mfa_required", "MFA Required")]

    user = models.ForeignKey(AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="login_history")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="success")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]


class APIKey(models.Model):
    company = models.ForeignKey("companies.Company", on_delete=models.CASCADE, related_name="api_keys")
    created_by = models.ForeignKey(AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_api_keys")
    name = models.CharField(max_length=100)
    key_prefix = models.CharField(max_length=10)
    key_hash = models.CharField(max_length=128)
    scopes = models.JSONField(default=list)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def generate(cls, company, created_by, name, scopes=None):
        raw_key = f"qt_{secrets.token_urlsafe(32)}"
        prefix = raw_key[:10]
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        obj = cls.objects.create(
            company=company,
            created_by=created_by,
            name=name,
            key_prefix=prefix,
            key_hash=key_hash,
            scopes=scopes or ["read"],
        )
        return obj, raw_key


class Webhook(models.Model):
    STATUS_CHOICES = [("active", "Active"), ("paused", "Paused"), ("failing", "Failing")]

    company = models.ForeignKey("companies.Company", on_delete=models.CASCADE, related_name="webhooks")
    created_by = models.ForeignKey(AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_webhooks")
    name = models.CharField(max_length=100)
    url = models.URLField(max_length=500)
    secret = models.CharField(max_length=64)
    events = models.JSONField(default=list)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    failure_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.secret:
            self.secret = secrets.token_hex(32)
        super().save(*args, **kwargs)


class TeamInvite(models.Model):
    STATUS_CHOICES = [("pending", "Pending"), ("accepted", "Accepted"), ("expired", "Expired"), ("revoked", "Revoked")]
    ROLE_CHOICES = [("admin", "Admin"), ("manager", "Manager"), ("employee", "Employee")]

    company = models.ForeignKey("companies.Company", on_delete=models.CASCADE, related_name="team_invites")
    invited_by = models.ForeignKey(AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sent_invites")
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="employee")
    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at


class Invoice(models.Model):
    STATUS_CHOICES = [("paid", "Paid"), ("pending", "Pending"), ("overdue", "Overdue")]

    company = models.ForeignKey("companies.Company", on_delete=models.CASCADE, related_name="invoices")
    invoice_number = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default="USD")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="paid")
    billing_date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)
    pdf_url = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-billing_date"]

    def __str__(self):
        return f"{self.invoice_number} - {self.company.company_name}"
