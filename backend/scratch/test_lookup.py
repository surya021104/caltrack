import os
import sys
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'quicktims.settings')

import django
django.setup()

from settings_hub.models import TeamInvite
from django.db import connection

token = 'SPtPdbNQVt1A0Z9vmQ-ptCzn7hPBnlLFF7d48gMxyNA'

print(f"Current schema: {connection.schema_name}")
try:
    invite = TeamInvite.objects.filter(token=token, status="pending").first()
    print(f"Invite found: {invite}")
except Exception as e:
    print(f"Error querying TeamInvite in public schema: {e}")

# Now try searching all schemas
from django_tenants.utils import schema_context
from companies.models import Company

found_in = None
for company in Company.objects.all():
    with schema_context(company.schema_name):
        if TeamInvite.objects.filter(token=token, status="pending").exists():
            found_in = company.schema_name
            break

print(f"Invite actually located in schema: {found_in}")
