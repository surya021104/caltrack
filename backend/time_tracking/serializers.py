from rest_framework import serializers

from .models import Break, TimeLog, TimeLogPhoto, JobSite, Location, LocationZone, EmployeeLocation


class JobSiteSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    class Meta:
        model = JobSite
        fields = ("id", "name", "address", "lat", "lng", "geofence_radius", "company")
        read_only_fields = ("id", "company")


class BreakSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = Break
        fields = ("id", "break_start", "break_end", "break_type", "duration_seconds", "created_at")
        read_only_fields = ("id", "created_at")

    def get_duration_seconds(self, obj):
        if not obj.break_end:
            return 0
        return int((obj.break_end - obj.break_start).total_seconds())


class TimeLogPhotoSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = TimeLogPhoto
        fields = ("id", "photo", "photo_type", "caption", "uploaded_at")


class TimeLogSerializer(serializers.ModelSerializer):
    id                = serializers.SerializerMethodField()
    employee          = serializers.SerializerMethodField()
    employee_name     = serializers.SerializerMethodField()
    employee_username = serializers.SerializerMethodField()
    breaks            = BreakSerializer(many=True, read_only=True)
    photos            = TimeLogPhotoSerializer(many=True, read_only=True)
    worked_seconds    = serializers.SerializerMethodField()
    worked_hours      = serializers.SerializerMethodField()
    break_seconds     = serializers.SerializerMethodField()
    approved_by       = serializers.SerializerMethodField()
    task              = serializers.SerializerMethodField()
    location_name     = serializers.SerializerMethodField()

    class Meta:
        model = TimeLog
        fields = (
            "id",
            "employee",
            "employee_name",
            "employee_username",
            "work_date",
            "clock_in",
            "clock_in_lat",
            "clock_in_lon",
            "clock_in_address",
            "clock_in_notes",
            "clock_in_photo",
            "clock_out",
            "clock_out_lat",
            "clock_out_lon",
            "clock_out_address",
            "clock_out_notes",
            "clock_out_photo",
            "location",
            "location_name",
            "distance_from_site_meters",
            "geofence_passed",
            "admin_override_used",
            "status",
            "submitted_at",
            "approved_by",
            "admin_notes",
            "manual_hours_correction",
            "face_match_status",
            "face_match_score",
            "breaks",
            "photos",
            "break_seconds",
            "worked_seconds",
            "worked_hours",
            "created_at",
            "updated_at",
            "task",
        )
        read_only_fields = ("id", "created_at", "updated_at", "submitted_at", "approved_by")

    def get_id(self, obj):
        return str(obj.id)

    def get_employee(self, obj):
        return str(obj.employee_id)

    def get_employee_name(self, obj):
        user = obj.employee.user
        full_name = f"{user.first_name} {user.last_name}".strip()
        return full_name or user.username

    def get_employee_username(self, obj):
        return obj.employee.user.username

    def get_break_seconds(self, obj):
        return obj.break_seconds()

    def get_worked_seconds(self, obj):
        return obj.worked_seconds()

    def get_worked_hours(self, obj):
        return round(obj.worked_seconds() / 3600, 2)

    def get_approved_by(self, obj):
        if not obj.approved_by_id:
            return None
        return str(obj.approved_by_id)

    def get_task(self, obj):
        if hasattr(obj, 'task') and obj.task:
            return {
                "id": str(obj.task.id),
                "title": obj.task.title,
                "status": obj.task.status
            }
        return None

    def get_location_name(self, obj):
        return obj.location.name if obj.location else None


# ── Location (with polygon support) ──────────────────────────────────────────

class LocationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    employee_count = serializers.SerializerMethodField()
    zone_names = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = (
            "id", "name", "address", "lat", "lng",
            "geofence_radius", "geofence_polygon", "geofence_type",
            "location_type", "is_active", "is_archived",
            "company", "created_at", "updated_at",
            "employee_count", "zone_names",
            "created_by", "created_by_name",
        )
        read_only_fields = (
            "id", "company", "created_at", "updated_at",
            "created_by", "created_by_name",
        )

    def get_employee_count(self, obj):
        return obj.permitted_employees.count()

    def get_zone_names(self, obj):
        return list(obj.zones.values_list("name", flat=True))

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return None
        u = obj.created_by
        return f"{u.first_name} {u.last_name}".strip() or u.username

    # ── Phase 2: server-side polygon validation ──────────────────────────
    def validate_geofence_polygon(self, value):
        """Reject malformed GeoJSON polygons before they reach the DB.

        None / empty are allowed (location may be circle-only). Any non-empty
        value runs through the geo.validators gate which checks shape,
        closure, vertex count, range, and self-intersection.
        """
        if value in (None, "", {}):
            return None
        from .geo.validators import validate_geojson_polygon
        return validate_geojson_polygon(value)


# ── Location Zone ─────────────────────────────────────────────────────────────

class LocationZoneSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    location_ids = serializers.PrimaryKeyRelatedField(
        source="locations", many=True, queryset=Location.objects.all(), required=False
    )
    location_count = serializers.SerializerMethodField()

    class Meta:
        model = LocationZone
        fields = (
            "id", "name", "description", "color",
            "location_ids", "location_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_location_count(self, obj):
        return obj.locations.count()

    def create(self, validated_data):
        locations = validated_data.pop("locations", [])
        zone = LocationZone.objects.create(**validated_data)
        zone.locations.set(locations)
        return zone

    def update(self, instance, validated_data):
        locations = validated_data.pop("locations", None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if locations is not None:
            instance.locations.set(locations)
        return instance


# ── Employee–Location Assignment ──────────────────────────────────────────────

class EmployeeLocationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeLocation
        fields = ("id", "employee", "location", "is_primary", "employee_name", "location_name")

    def get_employee_name(self, obj):
        u = obj.employee.user
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_location_name(self, obj):
        return obj.location.name
