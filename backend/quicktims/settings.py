from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

load_dotenv(override=True)

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-secret-key-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = [h for h in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

SHARED_APPS = [
    "django_tenants",
    "companies",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "accounts",
    "corsheaders",
    "rest_framework",
    "channels",
    "django_celery_beat",
]

TENANT_APPS = [
    "django.contrib.contenttypes",
    "employees",
    "time_tracking",
    "leaves",
    "payroll",
    "scheduling",
    "reports",
    "tasks",
    "live_locations",
    "compliance",
    "settings_hub",
]

INSTALLED_APPS = list(set(SHARED_APPS + TENANT_APPS))

TENANT_MODEL = "companies.Company"
TENANT_DOMAIN_MODEL = "companies.Domain"

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django_tenants.middleware.main.TenantMainMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "companies.middleware.CompanyMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

SHOW_PUBLIC_IF_NO_TENANT_FOUND = True

# ---------------------------------------------------------------------------
# Database Configuration - PostgreSQL (Production) or SQLite (Local Dev)
# ---------------------------------------------------------------------------

USE_POSTGRES = os.getenv("DB_NAME") or os.getenv("DB_HOST")

if USE_POSTGRES:
    DATABASE_ROUTERS = ('django_tenants.routers.TenantSyncRouter',)
    DATABASES = {
        "default": {
            "ENGINE": "django_tenants.postgresql_backend",
            "NAME": os.getenv("DB_NAME", "postgres"),
            "USER": os.getenv("DB_USER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
            "OPTIONS": {"sslmode": "require"},
            "CONN_MAX_AGE": 0,
            "CONN_HEALTH_CHECKS": True,
        }
    }
else:
    # Local Development Fallback to SQLite
    DATABASE_ROUTERS = ()
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
    # Remove tenant middleware if using SQLite
    MIDDLEWARE = [m for m in MIDDLEWARE if "django_tenants" not in m]
    # Remove django_tenants from installed apps if using SQLite
    if "django_tenants" in INSTALLED_APPS:
        INSTALLED_APPS.remove("django_tenants")



ROOT_URLCONF = "quicktims.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
            ],
        },
    }
]

WSGI_APPLICATION = "quicktims.wsgi.application"
ASGI_APPLICATION = "quicktims.asgi.application"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "accounts.backends.EmailOrUsernameModelBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# Use syncdb for all apps — avoids migration dependency issues with MongoDB
# (MongoDB doesn't benefit from SQL migration approach; collections are created on first use)
# MIGRATION_MODULES = {
#     "auth": None,
#     "contenttypes": None,
#     "sessions": None,
#     "accounts": None,
#     "employees": None,
#     "time_tracking": None,
#     "leaves": None,
#     "payroll": None,
#     "scheduling": None,
#     "reports": None,
#     "tasks": None,
#     "live_locations": None,
#     "companies": None,
# }

# Silence mongodb.E001 for Django's own built-in models (auth, sessions) whose
# id field is inherited BigAutoField. Our custom models all use ObjectIdAutoField.
SILENCED_SYSTEM_CHECKS = []

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # Cookie-first auth — also accepts Bearer header for API clients / mobile.
        "accounts.authentication.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ── httpOnly JWT Cookie settings ─────────────────────────────────────────────
AUTH_COOKIE          = "qt_access"         # access token cookie name
AUTH_COOKIE_REFRESH  = "qt_refresh"        # refresh token cookie name
AUTH_COOKIE_SECURE   = not DEBUG           # HTTPS-only in production; False in dev
AUTH_COOKIE_SAMESITE = "Strict"            # blocks CSRF entirely

# ── CORS — must name origins explicitly when credentials=True ────────────────
# CORS_ALLOW_ALL_ORIGINS + CORS_ALLOW_CREDENTIALS together are rejected by browsers.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ── Django Channels ──────────────────────────────────────────────────────────
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(os.getenv("REDIS_HOST", "127.0.0.1"), int(os.getenv("REDIS_PORT", "6379")))],
            "capacity": 1500,
            "expiry": 10,
        },
    },
}

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
