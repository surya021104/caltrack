from django.db import models
from django_tenants.models import TenantMixin, DomainMixin


class Company(TenantMixin):
    company_name = models.CharField(max_length=255)
    display_id = models.CharField(max_length=50, unique=True, null=True, blank=True)
    # slug will be used as schema_name by TenantMixin
    # auto_create_schema is True by default in TenantMixin

    class PrimaryCountry(models.TextChoices):
        US = "US", "United States"
        UK = "UK", "United Kingdom"
        
    primary_country = models.CharField(
        max_length=2, 
        choices=PrimaryCountry.choices,
        default=PrimaryCountry.US
    )
    
    default_state = models.CharField(max_length=100, blank=True, null=True)
    
    # Geofence Config
    geofence_enabled = models.BooleanField(default=True)
    geofence_radius_meters = models.PositiveIntegerField(default=200)
    geofence_strict_mode = models.BooleanField(default=True)  # true = block, false = warn only
    geofence_admin_override = models.BooleanField(default=True)
    
    class ComplianceMode(models.TextChoices):
        STRICT = "strict", "Strict"
        FLEXIBLE = "flexible", "Flexible"
        
    compliance_mode = models.CharField(
        max_length=20,
        choices=ComplianceMode.choices,
        default=ComplianceMode.STRICT
    )

    # ── Shift-Location Enforcement (Phase 1, Layer 3) ───────────────────────
    # Controls what happens when an employee clocks in for a shift but is not
    # at the shift's required location. Default 'warn' preserves existing
    # behaviour for tenants that have not configured shift locations yet.
    class ShiftEnforcementMode(models.TextChoices):
        BLOCK = "block", "Block clock-in"
        WARN = "warn", "Allow with warning flag"
        OFF = "off", "No shift-location enforcement"

    shift_enforcement_mode = models.CharField(
        max_length=10,
        choices=ShiftEnforcementMode.choices,
        default=ShiftEnforcementMode.WARN,
    )

    allowed_countries = models.JSONField(default=list, blank=True)
    team_size = models.CharField(max_length=100, blank=True, null=True)
    selected_modules = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # schema_name is required by TenantMixin
    # we'll use the slug logic to set schema_name

    def save(self, *args, **kwargs):
        if not self.display_id:
            import uuid
            self.display_id = f"ORG-{uuid.uuid4().hex[:6].upper()}"
        
        if not self.schema_name:
            from django.utils.text import slugify
            import uuid
            base_slug = slugify(self.company_name).replace('-', '_') or f"org_{uuid.uuid4().hex[:8]}"
            schema = base_slug
            i = 2
            while Company.objects.filter(schema_name=schema).exists():
                schema = f"{base_slug}_{i}"
                i += 1
            self.schema_name = schema
            
        super().save(*args, **kwargs)

    def __str__(self):
        return self.company_name


class Domain(DomainMixin):
    pass
