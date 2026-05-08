# Phase 1 — Layer 3 (Geolocation Enterprise) Architecture
# Adds Employee.allow_all_locations override.
# Default False mirrors the current require-explicit-assignment behaviour.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="allow_all_locations",
            field=models.BooleanField(default=False),
        ),
    ]
