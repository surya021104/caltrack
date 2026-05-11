"""
Celery application for QuickTIMS.

Start worker:
  celery -A quicktims worker -l info

Start beat scheduler:
  celery -A quicktims beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")

app = Celery("quicktims")

# Read config from Django settings, namespace = CELERY_*
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks from all INSTALLED_APPS
app.autodiscover_tasks()
