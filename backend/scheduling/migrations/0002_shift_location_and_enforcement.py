# Phase 1 — Layer 3 (Geolocation Enterprise) Architecture
# Links Shift to a required Location and adds an optional per-shift override
# of the company-level shift_enforcement_mode. Both fields are nullable /
# default 'inherit' so existing shifts keep working unchanged.
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0001_initial"),
        # Shift.location FK targets time_tracking.Location, which exists from
        # 0001_initial onward. Pinning to 0002 keeps the migration graph
        # explicit — no functional dependency on geofence_polygon.
        ("time_tracking", "0002_alter_location_options_location_geofence_polygon_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="shift",
            name="location",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="shifts",
                to="time_tracking.location",
            ),
        ),
        migrations.AddField(
            model_name="shift",
            name="enforcement_override",
            field=models.CharField(
                choices=[
                    ("inherit", "Inherit from company"),
                    ("block", "Block clock-in"),
                    ("warn", "Allow with warning"),
                    ("off", "No enforcement"),
                ],
                default="inherit",
                max_length=10,
            ),
        ),
    ]
