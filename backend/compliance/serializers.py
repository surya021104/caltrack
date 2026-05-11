from rest_framework import serializers
from .models import AuditLog, HolidayAccrual, RightToWork, WTROptOut, OvertimeAlert, BreakAttestation


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id", "time_log_id", "employee", "employee_name", "actor",
            "actor_name", "action", "reason", "before_state", "after_state",
            "timestamp", "retention_until",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name() or obj.actor.username
        return "system"

    def get_employee_name(self, obj):
        if obj.employee:
            return obj.employee.user.get_full_name() or obj.employee.user.username
        return ""


class HolidayAccrualSerializer(serializers.ModelSerializer):
    reg13_hours_remaining = serializers.ReadOnlyField()
    reg13a_hours_remaining = serializers.ReadOnlyField()
    total_hours_remaining = serializers.ReadOnlyField()

    class Meta:
        model = HolidayAccrual
        fields = [
            "id", "employee", "leave_year_start", "leave_year_end",
            "reg13_hours_accrued", "reg13a_hours_accrued",
            "reg13_hours_taken", "reg13a_hours_taken",
            "carry_over_hours", "average_hourly_rate", "rolled_up_pay_enabled",
            "reg13_hours_remaining", "reg13a_hours_remaining", "total_hours_remaining",
            "updated_at",
        ]


class RightToWorkSerializer(serializers.ModelSerializer):
    days_until_expiry = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()

    class Meta:
        model = RightToWork
        fields = [
            "id", "employee", "document_type", "document_number", "document_file",
            "issue_date", "expiry_date", "status", "verified_by", "verified_at",
            "notes", "alert_sent_60d", "alert_sent_30d", "alert_sent_7d",
            "days_until_expiry", "is_expired", "created_at", "updated_at",
        ]
        read_only_fields = ["verified_by", "verified_at", "alert_sent_60d", "alert_sent_30d", "alert_sent_7d"]


class WTROptOutSerializer(serializers.ModelSerializer):
    class Meta:
        model = WTROptOut
        fields = ["id", "employee", "agreement_file", "signed_on", "is_active", "withdrawn_on", "created_at"]


class OvertimeAlertSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = OvertimeAlert
        fields = [
            "id", "employee", "employee_name", "iso_year", "iso_week",
            "alert_type", "hours_worked", "threshold_hours", "is_resolved", "created_at",
        ]

    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name() or obj.employee.user.username


class BreakAttestationSerializer(serializers.ModelSerializer):
    class Meta:
        model = BreakAttestation
        fields = ["id", "employee", "time_log", "attested_at", "break_taken", "notes"]
