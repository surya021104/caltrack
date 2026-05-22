from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Employee
from .utils import generate_next_employee_id

User = get_user_model()


class EmployeeUserSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role")
        read_only_fields = ("id",)


class EmployeeSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    user = EmployeeUserSerializer(read_only=True)
    first_name = serializers.CharField(source='user.first_name', required=False)
    last_name = serializers.CharField(source='user.last_name', required=False)
    email = serializers.EmailField(source='user.email', required=False)
    role = serializers.CharField(source='user.role', required=False)
    job_site_name = serializers.SlugRelatedField(
        source='assigned_job_site',
        read_only=True,
        slug_field='name'
    )
    # ── Live availability (computed, never stored) ────────────────────────
    # Values: "available" | "busy" | "on_break" | "on_leave" | "offline"
    current_availability = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = (
            "id",
            "employee_id",
            "user",
            "first_name",
            "last_name",
            "email",
            "role",
            "phone",
            "title",
            "hourly_rate",
            "hire_date",
            "date_of_birth",
            "assigned_job_site",
            "job_site_name",
            "allow_all_locations",  # Phase 1 — bypass EmployeeLocation filter
            "country",
            "state",
            "exempt_status",
            "exempt_history",
            "flsa_duties_category",
            "weekly_salary",
            "uk_tax_code",
            "uk_ni_category",
            "rolled_up_holiday_pay",
            "wtr_opt_out_active",
            "is_active",
            "current_availability",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_current_availability(self, employee):
        """
        Compute live availability by checking:
          1. Employee is inactive        → offline
          2. Has an open Break today     → on_break
          3. Has an open TimeLog today   → busy
          4. Has approved leave today    → on_leave
          5. Otherwise                   → available
        """
        from django.utils import timezone
        from time_tracking.models import TimeLog, Break
        from leaves.models import LeaveRequest

        if not employee.is_active:
            return "offline"

        today = timezone.localdate()

        # Check for an open time log (clocked in, not yet clocked out)
        open_log = TimeLog.objects.filter(
            employee=employee,
            work_date=today,
            clock_out__isnull=True,
        ).first()

        if open_log:
            # Check if currently on a break within that log
            on_break = Break.objects.filter(
                time_log=open_log,
                break_end__isnull=True,
            ).exists()
            return "on_break" if on_break else "busy"

        # Check for approved leave covering today
        on_leave = LeaveRequest.objects.filter(
            employee=employee,
            status=LeaveRequest.Status.APPROVED,
            start_date__lte=today,
            end_date__gte=today,
        ).exists()

        return "on_leave" if on_leave else "available"

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        user = instance.user

        # Update user fields
        for attr, value in user_data.items():
            setattr(user, attr, value)
        user.save()

        # Update employee fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class EmployeeCreateSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.EMPLOYEE, write_only=True)
    employee_id = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Employee
        fields = (
            "id",
            "employee_id",
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "role",
            "phone",
            "title",
            "hourly_rate",
            "hire_date",
            "date_of_birth",
            "assigned_job_site",
            "allow_all_locations",
            "country",
            "state",
            "exempt_status",
            "weekly_salary",
            "uk_tax_code",
            "uk_ni_category",
            "rolled_up_holiday_pay",
            "wtr_opt_out_active",
            "is_active",
        )

    def create(self, validated_data):
        username = validated_data.pop("username")
        password = validated_data.pop("password")
        email = validated_data.pop("email", "")
        first_name = validated_data.pop("first_name", "")
        last_name = validated_data.pop("last_name", "")
        role = validated_data.pop("role", User.Role.EMPLOYEE)
        
        request = self.context.get("request")
        company = getattr(request, "company", None)

        if not company:
            # Final fallback: check if current user has an employee record
            emp = Employee.objects.filter(user=request.user).first()
            if emp:
                company = emp.company

        if not company:
            raise serializers.ValidationError({"detail": "You must be associated with a company to add members."})

        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError({"detail": f"The username '{username}' is already taken by another user in the system. Usernames must be globally unique."})

        try:
            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=role,
                company=company
            )
            
            if not validated_data.get("employee_id"):
                validated_data["employee_id"] = generate_next_employee_id(company)
                
            return Employee.objects.create(user=user, company=company, **validated_data)
        except Exception as e:
            # Handle potential integrity errors (duplicate username, etc)
            raise serializers.ValidationError({"detail": str(e)})
