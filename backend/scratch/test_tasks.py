import os
import django
import sys

sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from django.contrib.auth import get_user_model
from companies.models import Company
from tasks.models import Task
from tasks.views import EmployeeTaskActionView
from rest_framework.test import APIRequestFactory, force_authenticate

def run_test():
    User = get_user_model()
    try:
        user = User.objects.get(username='jessica')
        print(f"Using employee user: {user.username}")
    except User.DoesNotExist:
        user = User.objects.exclude(role="admin").first()
        if not user:
            print("No employee user found.")
            return
        print(f"Using first non-admin user: {user.username}")

    try:
        companies = list(Company.objects.exclude(schema_name="public"))
        if not companies:
            print("No tenant companies found.")
            return
        print(f"Found tenant schemas: {[c.schema_name for c in companies]}")
    except Exception as e:
        print("Failed to load companies:", e)
        return

    # Monkeypatch get_object to ignore company filter for test simplicity
    def mock_get_object(self, pk, user, company):
        try:
            return Task.objects.get(pk=pk, assigned_to=user)
        except Task.DoesNotExist:
            return None
    EmployeeTaskActionView.get_object = mock_get_object

    from django_tenants.utils import schema_context
    factory = APIRequestFactory()

    for company in companies:
        print(f"\n--- Testing tasks for schema: {company.schema_name} ---")
        with schema_context(company.schema_name):
            try:
                tenant_user = User.objects.get(username='jessica')
                print(f"Using tenant user: {tenant_user.username}")
            except User.DoesNotExist:
                tenant_user = User.objects.exclude(role="admin").first()
                if not tenant_user:
                    print("No user found in this schema.")
                    continue
                print(f"Using first user: {tenant_user.username}")

            # Create a new test task
            task = Task.objects.create(
                title="Test Status Button Task",
                description="Testing automated status flow",
                assigned_to=tenant_user,
                acceptance_status=Task.AcceptanceStatus.PENDING_ACCEPTANCE,
                status=Task.Status.PENDING
            )
            print(f"Created task: {task.title} (ID: {task.id})")
            print(f"Initial State - Acceptance: {task.acceptance_status}, Status: {task.status}")

            # 1. Accept task
            print("\n- Testing 'accept' action...")
            request = factory.post(f"/api/tasks/my/{task.id}/accept/")
            force_authenticate(request, user=tenant_user)
            request.user = tenant_user
            request.company = company
            view = EmployeeTaskActionView.as_view()
            response = view(request, pk=task.id, action="accept")
            print("Accept status code:", response.status_code)
            print("Accept response data:", response.data.get("acceptance_status"), response.data.get("status"))

            # 2. Start task
            print("\n- Testing 'start' action...")
            request = factory.post(f"/api/tasks/my/{task.id}/start/", {"lat": 12.34, "lon": 56.78})
            force_authenticate(request, user=tenant_user)
            request.user = tenant_user
            request.company = company
            response = view(request, pk=task.id, action="start")
            print("Start status code:", response.status_code)
            print("Start response status:", response.data.get("status"))

            # 3. Complete task
            print("\n- Testing 'complete' action...")
            request = factory.post(f"/api/tasks/my/{task.id}/complete/", {"notes": "Done with automated test"})
            force_authenticate(request, user=tenant_user)
            request.user = tenant_user
            request.company = company
            response = view(request, pk=task.id, action="complete")
            print("Complete status code:", response.status_code)
            print("Complete response status:", response.data.get("status"))
            print("Billed Hours computed:", response.data.get("billed_hours"))

            # Clean up
            task.delete()
            print("\nTest task cleaned up successfully.")

if __name__ == "__main__":
    run_test()
