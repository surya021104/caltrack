from rest_framework import serializers
from .models import (
    NotificationPreference, LoginSession, LoginHistory,
    APIKey, Webhook, TeamInvite, Invoice,
)


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        exclude = ["user"]


class LoginSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoginSession
        fields = [
            "id", "device_type", "device_name", "ip_address",
            "location", "created_at", "last_active", "is_current",
        ]


class LoginHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LoginHistory
        fields = ["id", "ip_address", "location", "status", "created_at", "user_agent"]


class APIKeySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = APIKey
        fields = [
            "id", "name", "key_prefix", "scopes", "last_used_at",
            "expires_at", "revoked", "created_at", "created_by_name",
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ""


class APIKeyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    scopes = serializers.ListField(
        child=serializers.ChoiceField(choices=["read", "write", "admin"]),
        default=["read"],
    )
    expires_in_days = serializers.IntegerField(required=False, min_value=1, max_value=365)


class WebhookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Webhook
        fields = [
            "id", "name", "url", "secret", "events", "status",
            "last_triggered_at", "failure_count", "created_at",
        ]
        read_only_fields = ["secret", "last_triggered_at", "failure_count", "created_at"]


class TeamInviteSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = TeamInvite
        fields = [
            "id", "email", "role", "status", "expires_at",
            "created_at", "invited_by_name", "is_expired",
        ]

    def get_invited_by_name(self, obj):
        if obj.invited_by:
            return obj.invited_by.get_full_name() or obj.invited_by.username
        return ""


class TeamInviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["admin", "manager", "employee"])


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = "__all__"
