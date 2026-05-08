from rest_framework import serializers
from .models import Company


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = [
            "id",
            "company_name",
            "display_id",
            "schema_name",
            "primary_country",
            "default_state",
            "compliance_mode",
            "shift_enforcement_mode",  # Phase 1 — block | warn | off
            "allowed_countries",
            "team_size",
            "selected_modules",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "display_id", "schema_name", "created_at", "updated_at"]

    def validate(self, data):
        primary_country = data.get("primary_country")
        default_state = data.get("default_state")

        if primary_country == "US" and not default_state:
            raise serializers.ValidationError(
                {"default_state": "Default state is required for US-based companies."}
            )
        return data
