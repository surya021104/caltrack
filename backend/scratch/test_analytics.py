import os
import django
import sys
import traceback

sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from django.contrib.auth import get_user_model
from companies.models import Company
from reports.views import DashboardAnalyticsView
from rest_framework.test import APIRequestFactory

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

    # Use django-tenants schema_context to execute the view in the tenant's context
    from django_tenants.utils import schema_context
    from rest_framework.test import force_authenticate
    
    for company in companies:
        print(f"\n--- Testing schema: {company.schema_name} ---")
        with schema_context(company.schema_name):
            factory = APIRequestFactory()
            request = factory.get("/api/reports/dashboard-analytics/")
            force_authenticate(request, user=user)
            request.user = user
            request.company = company
            
            view = DashboardAnalyticsView.as_view()
            try:
                response = view(request)
                print(f"Schema {company.schema_name} Status Code:", response.status_code)
                if response.status_code != 200:
                    print("Response content:", response.data)
            except Exception as ex:
                print(f"\n--- DETAILED PYTHON EXCEPTION FOR SCHEMA: {company.schema_name} ---")
                traceback.print_exc()
                print("---------------------------------")

if __name__ == "__main__":
    run_test()
