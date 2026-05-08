from rest_framework import serializers

from employees.models import Employee
from .models import Shift


class ShiftSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        pk_field=serializers.CharField()
    )
    location_name = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        # Phase 1: location + enforcement_override are optional. Existing
        # clients that don't send them keep working unchanged.
        fields = (
            "id", "employee",
            "shift_start", "shift_end",
            "title", "notes",
            "location", "location_name", "enforcement_override",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "location_name")

    def get_location_name(self, obj):
        return obj.location.name if obj.location_id else None

    def validate(self, attrs):
        start = attrs.get("shift_start")
        end = attrs.get("shift_end")
        if start and end and end <= start:
            raise serializers.ValidationError({"shift_end": "Shift end must be after shift start."})
        return attrs
