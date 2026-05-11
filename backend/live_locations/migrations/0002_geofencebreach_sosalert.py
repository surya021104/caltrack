from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("live_locations", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("employees", "0002_initial"),
        ("time_tracking", "0002_alter_location_options_location_geofence_polygon_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="GeofenceBreach",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("lat", models.DecimalField(decimal_places=6, max_digits=9)),
                ("lng", models.DecimalField(decimal_places=6, max_digits=9)),
                ("location_name", models.CharField(max_length=255)),
                ("distance_meters", models.IntegerField()),
                ("geofence_radius", models.IntegerField()),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="geofence_breaches",
                        to="employees.employee",
                    ),
                ),
                (
                    "time_log",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="geofence_breaches",
                        to="time_tracking.timelog",
                    ),
                ),
            ],
            options={
                "ordering": ["-timestamp"],
            },
        ),
        migrations.AddIndex(
            model_name="geofencebreach",
            index=models.Index(fields=["employee", "timestamp"], name="live_loc_breach_emp_ts_idx"),
        ),
        migrations.CreateModel(
            name="SOSAlert",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("lat", models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ("lng", models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ("triggered_at", models.DateTimeField(auto_now_add=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("acknowledged", "Acknowledged"),
                            ("resolved", "Resolved"),
                        ],
                        default="active",
                        max_length=20,
                    ),
                ),
                ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                (
                    "acknowledged_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="acknowledged_sos_alerts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sos_alerts",
                        to="employees.employee",
                    ),
                ),
                (
                    "time_log",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="sos_alerts",
                        to="time_tracking.timelog",
                    ),
                ),
            ],
            options={
                "ordering": ["-triggered_at"],
            },
        ),
        migrations.AddIndex(
            model_name="sosalert",
            index=models.Index(fields=["employee", "triggered_at"], name="live_loc_sos_emp_ts_idx"),
        ),
        migrations.AddIndex(
            model_name="sosalert",
            index=models.Index(fields=["status"], name="live_loc_sos_status_idx"),
        ),
    ]
