# PostgreSQL backend (Supabase) — no MySQL adapter needed

# Make Celery app available at module level so Django's auto-reload
# and management commands pick it up correctly.
from .celery import app as celery_app  # noqa: F401

__all__ = ["celery_app"]
