# Phase 1 — Layer 3 (Geolocation Enterprise) Architecture
# Adds Location.geofence_type discriminator and Location.created_by audit FK.
# Defaults preserve current circle-only validation behaviour.
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("time_tracking", "0002_alter_location_options_location_geofence_polygon_and_more"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="location",
            name="geofence_type",
            field=models.CharField(
                choices=[
                    ("circle", "Circle (radius)"),
                    ("polygon", "Polygon (GeoJSON)"),
                    ("hybrid", "Hybrid (circle OR polygon)"),
                ],
                default="circle",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="location",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="created_locations",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
