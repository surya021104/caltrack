import os
import django
import sys

# Setup Django
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
sys.path.append(BACKEND_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from time_tracking.models import TimeLog

logs = TimeLog.objects.order_by("-clock_in")[:5]
print(f"Found {len(logs)} logs")
for l in logs:
    print(f"ID: {l.id}, Date: {l.work_date}, In: {l.clock_in}, Photo: {l.clock_in_photo.name if l.clock_in_photo else 'None'}")
