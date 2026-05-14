import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from django_tenants.utils import schema_context
from live_locations.models import SOSAlert
from companies.models import Company

print("Scanning all schemas for SOS alerts...")
for company in Company.objects.all():
    if company.schema_name == 'public': continue
    with schema_context(company.schema_name):
        count = SOSAlert.objects.count()
        active = SOSAlert.objects.filter(status='active').count()
        if count > 0:
            print(f"[{company.schema_name}] Total: {count}, Active: {active}")
print("Scan complete.")
