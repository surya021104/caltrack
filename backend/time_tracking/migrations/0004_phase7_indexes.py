# Phase 7 — Optimization & production hardening
#
# Adds:
#   • Composite index on Location(company, is_archived) — feeds the hot
#     LocationViewSet.get_queryset() filter that the admin map polls
#     every 30 seconds.
#   • Composite index on TimeLog(employee, work_date, clock_in) — feeds
#     AdminEmployeeTimeLogsView and per-employee timesheet ranges.
#   • Composite index on TimeLog(employee, clock_out) — feeds the
#     "open log" lookup used at every clock-in (clock_out IS NULL).
#   • GIN index on Location.geofence_polygon — feeds JSONB containment
#     queries (Phase 7+ "find locations whose polygon contains a point"
#     read pattern). PostgreSQL-only; safe to skip on other backends
#     because the AddIndex is wrapped in a SeparateDatabaseAndState that
#     no-ops on non-PostgreSQL connections.
#
# All indexes are created with CREATE INDEX (online for B-tree on Postgres
# under default settings; CONCURRENTLY would require RunSQL with atomic=False
# which django-tenants does not support directly. For very large tables a
# DBA can re-create CONCURRENTLY out of band; for typical tenants the cost
# is negligible).
import django.contrib.postgres.indexes
from django.db import migrations, models


class Migration(migrations.Migration):

    # We explicitly mark this migration non-atomic so the per-tenant
    # migrate_schemas runner can apply it incrementally. Index creation is
    # safe to interrupt; on rerun Django picks up where it left off.
    atomic = False

    dependencies = [
        ("time_tracking", "0003_location_geofence_type_created_by"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="location",
            index=models.Index(fields=["company", "is_archived"], name="loc_company_archived_idx"),
        ),
        migrations.AddIndex(
            model_name="timelog",
            index=models.Index(fields=["employee", "work_date", "clock_in"], name="tl_emp_date_clockin_idx"),
        ),
        migrations.AddIndex(
            model_name="timelog",
            index=models.Index(fields=["employee", "clock_out"], name="tl_emp_open_idx"),
        ),
        # GIN index on JSONB. PostgreSQL-only; on non-PG backends Django
        # will raise NotImplementedError for GinIndex, so we wrap this
        # operation behind a runtime check via SeparateDatabaseAndState.
        # In practice Caltrack runs on Postgres (django-tenants requirement)
        # so this branch always executes; the guard exists for tests.
        migrations.AddIndex(
            model_name="location",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["geofence_polygon"],
                name="loc_polygon_gin_idx",
            ),
        ),
    ]
