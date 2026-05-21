import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'quicktims.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()
cursor.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'")
tables = [row[0] for row in cursor.fetchall()]
print("Public tables:", tables)

from settings_hub.models import TeamInvite
try:
    invites = list(TeamInvite.objects.all().values('email', 'status'))
    print("Invites:", invites)
except Exception as e:
    print("Error querying TeamInvite:", e)
