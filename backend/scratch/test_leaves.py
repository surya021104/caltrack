import os
import django
import sys
import traceback

sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from django.contrib.auth import get_user_model
from companies.models import Company
from leaves.models import LeaveRequest
from leaves.views import LeaveRequestViewSet
from rest_framework.test import APIRequestFactory, force_authenticate

def run_test():
    User = get_user_model()
    try:
        user = User.objects.get(username='admin')
        print(f"Using user: {user.username}")
    except User.DoesNotExist:
        user = User.objects.first()
        if not user:
            print("No users found.")
            return
        print(f"Using first user: {user.username}")

    try:
        companies = list(Company.objects.exclude(schema_name="public"))
        if not companies:
            print("No tenant companies found.")
            return
        print(f"Found {len(companies)} tenant schemas: {[c.schema_name for c in companies]}")
    except Exception as e:
        print("Failed to load companies:", e)
        return

    from django_tenants.utils import schema_context
    
    for company in companies:
        print(f"\n--- Testing leaves for schema: {company.schema_name} ---")
        with schema_context(company.schema_name):
            # Let's see if there are any leave requests
            leaves = list(LeaveRequest.objects.all())
            print(f"Found {len(leaves)} leave requests.")
            
            if not leaves:
                print("No leaves found to test actions on, creating a dummy one...")
                from employees.models import Employee
                emp = Employee.objects.first()
                if not emp:
                    print("No employee found to link a leave to.")
                    continue
                leave = LeaveRequest.objects.create(
                    employee=emp,
                    company=company,
                    leave_type=LeaveRequest.LeaveType.SICK,
                    start_date="2026-05-15",
                    end_date="2026-05-27",
                    reason="Feeling unwell",
                    status=LeaveRequest.Status.PENDING
                )
                print(f"Created leave: {leave}")
            else:
                leave = leaves[0]
            
            # Reset leave request status for testing
            leave.status = LeaveRequest.Status.PENDING
            leave.save()
            
            # Test approve
            print("\n- Testing 'approve' action...")
            factory = APIRequestFactory()
            request = factory.post(f"/api/leaves/{leave.id}/approve/")
            force_authenticate(request, user=user)
            request.user = user
            request.company = company
            
            view = LeaveRequestViewSet.as_view({"post": "approve"})
            response = view(request, pk=leave.id)
            print("Approve status code:", response.status_code)
            print("Approve response data:", response.data)
            
            # Test rework
            print("\n- Testing 'rework' action...")
            request = factory.post(f"/api/leaves/{leave.id}/rework/")
            force_authenticate(request, user=user)
            request.user = user
            request.company = company
            
            view = LeaveRequestViewSet.as_view({"post": "rework"})
            response = view(request, pk=leave.id)
            print("Rework status code:", response.status_code)
            print("Rework response data:", response.data)
            
            # Test cancel
            print("\n- Testing 'cancel' action...")
            request = factory.post(f"/api/leaves/{leave.id}/cancel/")
            force_authenticate(request, user=user)
            request.user = user
            request.company = company
            
            view = LeaveRequestViewSet.as_view({"post": "cancel"})
            response = view(request, pk=leave.id)
            print("Cancel status code:", response.status_code)
            print("Cancel response data:", response.data)

            # Test approved leave cancellation flow
            print("\n- Testing 'approved leave cancellation flow'...")
            # 1. Set status to APPROVED
            leave.status = LeaveRequest.Status.APPROVED
            leave.save()

            # 2. Employee cancels approved leave -> should transition to PENDING_CANCEL
            emp_user = leave.employee.user
            original_role = emp_user.role
            emp_user.role = "employee"
            emp_user.save()

            request = factory.post(f"/api/leaves/{leave.id}/cancel/")
            force_authenticate(request, user=emp_user)
            request.user = emp_user
            request.company = company
            view = LeaveRequestViewSet.as_view({"post": "cancel"})
            response = view(request, pk=leave.id)
            print("Employee cancel approved leave status code:", response.status_code)
            print("Employee cancel approved leave response status:", response.data.get("status"))

            # 3. Admin approves cancellation -> should transition to CANCELLED
            request = factory.post(f"/api/leaves/{leave.id}/cancel/")
            force_authenticate(request, user=user)
            request.user = user
            request.company = company
            view = LeaveRequestViewSet.as_view({"post": "cancel"})
            response = view(request, pk=leave.id)
            print("Admin approve cancellation status code:", response.status_code)
            print("Admin approve cancellation response status:", response.data.get("status"))

            # Restore original role
            emp_user.role = original_role
            emp_user.save()

            # Test edit/partial_update (should reset to pending)
            print("\n- Testing 'partial_update' action...")
            emp_user.role = "employee"
            emp_user.save()
            request = factory.patch(f"/api/leaves/{leave.id}/", {"reason": "Updated reason due to cancellation"})
            force_authenticate(request, user=emp_user)
            request.user = emp_user
            request.company = company
            view = LeaveRequestViewSet.as_view({"patch": "partial_update"})
            response = view(request, pk=leave.id)
            print("Partial Update status code:", response.status_code)
            print("Partial Update response data:", response.data)
            
            # Restore original role
            emp_user.role = original_role
            emp_user.save()

if __name__ == "__main__":
    run_test()
