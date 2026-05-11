from rest_framework import serializers
from .models import PayrollPeriod, PayrollRecord


class PayrollPeriodSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = PayrollPeriod
        fields = ("id", "start_date", "end_date", "created_at")
        read_only_fields = ("id", "created_at")


class PayrollRecordSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    employee = serializers.CharField(source="employee.employee_id", read_only=True)
    employee_name = serializers.CharField(source="employee.user.get_full_name", read_only=True)
    generated_by = serializers.CharField(source="generated_by.id", read_only=True)
    period = PayrollPeriodSerializer(read_only=True)

    class Meta:
        model = PayrollRecord
        fields = (
            "id", "period", "employee", "employee_name",
            "hourly_rate", "regular_hours", "overtime_hours",
            "daily_ot_hours", "double_time_hours",
            "paid_leave_hours", "unpaid_leave_hours",
            "gross_pay", "uk_income_tax", "uk_employee_ni",
            "uk_employer_ni", "uk_tax_code", "uk_ni_category",
            "holiday_hours_accrued", "net_pay", "region",
            "is_exempt", "wage_floor_compliant",
            "generated_by", "generated_at",
        )
        read_only_fields = ("id", "gross_pay", "net_pay", "generated_by", "generated_at")


class PayrollGenerateSerializer(serializers.Serializer):
    employee = serializers.CharField()
    start = serializers.DateField()
    end = serializers.DateField()
