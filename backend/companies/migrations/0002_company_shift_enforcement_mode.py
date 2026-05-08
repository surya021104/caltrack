# Phase 1 — Layer 3 (Geolocation Enterprise) Architecture
# Adds Company.shift_enforcement_mode for shift–location policy resolution.
# Default 'warn' preserves current implicit behaviour for existing tenants.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="shift_enforcement_mode",
            field=models.CharField(
                choices=[
                    ("block", "Block clock-in"),
                    ("warn", "Allow with warning flag"),
                    ("off", "No shift-location enforcement"),
                ],
                default="warn",
                max_length=10,
            ),
        ),
    ]
