from django.db import models

from employees.models import Employee


class JobSite(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="job_sites", null=True, blank=True)
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    geofence_radius = models.PositiveIntegerField(null=True, blank=True)  # override org default

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Location(models.Model):
    """Org location — office, job site, client site, etc."""

    LOCATION_TYPES = [
        ("office", "Office"),
        ("job_site", "Job Site"),
        ("client_site", "Client Site"),
        ("warehouse", "Warehouse"),
        ("other", "Other"),
    ]

    # ── Geofence shape discriminator (Phase 1, Layer 3) ──────────────────
    # 'circle'  — use geofence_radius (current default behaviour)
    # 'polygon' — use geofence_polygon (server-side validation in Phase 2)
    # 'hybrid'  — accept point inside circle OR inside polygon
    GEOFENCE_TYPES = [
        ("circle", "Circle (radius)"),
        ("polygon", "Polygon (GeoJSON)"),
        ("hybrid", "Hybrid (circle OR polygon)"),
    ]

    company = models.ForeignKey(
        'companies.Company', on_delete=models.CASCADE,
        related_name="saved_locations", null=True, blank=True
    )
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    lat = models.FloatField()
    lng = models.FloatField()

    # Circle geofence (metres)
    geofence_radius = models.PositiveIntegerField(default=300)

    # Polygon geofence — GeoJSON geometry object stored as JSON
    # e.g. {"type":"Polygon","coordinates":[[[lng,lat],...]]}
    geofence_polygon = models.JSONField(null=True, blank=True)

    # Discriminator — which shape to validate against. Default 'circle'
    # mirrors current implicit behaviour for back-compat.
    geofence_type = models.CharField(
        max_length=10, choices=GEOFENCE_TYPES, default="circle"
    )

    location_type = models.CharField(
        max_length=20, choices=LOCATION_TYPES, default="office"
    )
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)

    # Audit: who created the location. Nullable for backfilled rows.
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name="created_locations",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        # Phase 7: composite index used by LocationViewSet.get_queryset and
        # LocationOverviewView, which always filter by (company, is_archived).
        # The PostgreSQL GIN index on geofence_polygon is declared in the
        # migration directly (GinIndex requires django.contrib.postgres,
        # which we don't put in INSTALLED_APPS just to satisfy a single
        # JSONB index definition).
        indexes = [
            models.Index(fields=["company", "is_archived"], name="loc_company_archived_idx"),
        ]

    def __str__(self):
        return self.name


class LocationZone(models.Model):
    """Group of locations forming a zone (e.g. 'North Sites')."""
    company = models.ForeignKey(
        'companies.Company', on_delete=models.CASCADE,
        related_name="location_zones", null=True, blank=True
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default="#4F46E5")  # hex colour for map
    locations = models.ManyToManyField(Location, related_name="zones", blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class EmployeeLocation(models.Model):
    """Which locations an employee is permitted to clock in at."""
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="permitted_locations"
    )
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name="permitted_employees"
    )
    is_primary = models.BooleanField(default=False)

    class Meta:
        unique_together = ("employee", "location")

    def __str__(self):
        return f"{self.employee} @ {self.location}"


class TimeLog(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="time_logs")
    work_date = models.DateField(db_index=True)
    clock_in = models.DateTimeField()
    clock_in_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_in_lon = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_in_address = models.TextField(blank=True)
    clock_in_notes = models.TextField(blank=True)
    clock_in_photo = models.ImageField(upload_to="time_logs/photos/", null=True, blank=True)

    clock_out = models.DateTimeField(null=True, blank=True)
    clock_out_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_out_lon = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_out_address = models.TextField(blank=True)
    clock_out_notes = models.TextField(blank=True)
    clock_out_photo = models.ImageField(upload_to="time_logs/photos/", null=True, blank=True)

    # Which location was matched at clock-in
    location = models.ForeignKey(
        Location, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="time_logs"
    )

    # Geofencing
    distance_from_site_meters = models.IntegerField(null=True, blank=True)
    geofence_passed = models.BooleanField(default=False)
    admin_override_used = models.BooleanField(default=False)

    # Approval Workflow
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_logs")
    admin_notes = models.TextField(blank=True)

    # Face Verification
    FACE_MATCH_CHOICES = [
        ('pending', 'Pending'),
        ('matched', 'Matched'),
        ('mismatch', 'Mismatch'),
        ('skipped', 'Skipped'),
    ]
    face_match_status = models.CharField(max_length=20, choices=FACE_MATCH_CHOICES, default='pending')
    face_match_score = models.FloatField(null=True, blank=True)

    manual_hours_correction = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["employee", "work_date"]),
            # Phase 7: hot path for LocationOverviewView (open logs scan)
            # and AdminEmployeeTimeLogsView (per-employee log list).
            models.Index(fields=["employee", "work_date", "clock_in"], name="tl_emp_date_clockin_idx"),
            models.Index(fields=["employee", "clock_out"], name="tl_emp_open_idx"),
        ]

    @property
    def is_open(self) -> bool:
        return self.clock_out is None

    def break_seconds(self) -> int:
        total = 0
        for b in self.breaks.all():
            if b.break_end:
                total += int((b.break_end - b.break_start).total_seconds())
        return total

    def worked_seconds(self) -> int:
        if not self.clock_out:
            return 0
        raw = int((self.clock_out - self.clock_in).total_seconds())
        return max(0, raw - self.break_seconds())


class Break(models.Model):
    time_log = models.ForeignKey(TimeLog, on_delete=models.CASCADE, related_name="breaks")
    break_start = models.DateTimeField()
    break_end = models.DateTimeField(null=True, blank=True)

    BREAK_TYPES = [
        ("lunch", "Lunch"),
        ("short", "Short"),
        ("personal", "Personal"),
    ]
    break_type = models.CharField(max_length=20, choices=BREAK_TYPES, default="lunch")

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_open(self) -> bool:
        return self.break_end is None


class TimeLogPhoto(models.Model):
    time_log = models.ForeignKey(TimeLog, on_delete=models.CASCADE, related_name="photos")
    photo = models.ImageField(upload_to="job_photos/")
    photo_type = models.CharField(max_length=20, choices=[
        ("before", "Before"),
        ("after", "After"),
        ("progress", "Progress"),
    ])
    caption = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
