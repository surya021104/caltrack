import os
import sys
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'quicktims.settings')

import django
django.setup()

from django.db import connection
from django_tenants.utils import schema_context

from companies.models import Company
from settings_hub.models import TeamInvite

target_email = 'pradeepravikumar64@gmail.com'
found = False

# Get all companies (tenants)
companies = Company.objects.all()
print(f"Checking {companies.count()} companies...")

for company in companies:
    with schema_context(company.schema_name):
        try:
            invites = TeamInvite.objects.filter(email=target_email)
            if invites.exists():
                for invite in invites:
                    print(f"Found invite in schema '{company.schema_name}':")
                    print(f"  Email: {invite.email}")
                    print(f"  Status: {invite.status}")
                    print(f"  Token: {invite.token}")
                    print(f"  Created At: {invite.created_at}")
                found = True
        except Exception as e:
            # Table might not exist in some schemas if migrations are out of sync
            pass

if not found:
    print(f"No invite found for {target_email} in any tenant schema.")
