from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path("api/auth/", include("accounts.urls")),
    path("api/company/", include("companies.urls")),
    path("api/employees/", include("employees.urls")),
    path("api/time/", include("time_tracking.urls")),
    path("api/leaves/", include("leaves.urls")),
    path("api/payroll/", include("payroll.urls")),
    path("api/scheduling/", include("scheduling.urls")),
    path("api/reports/", include("reports.urls")),
    path("api/tasks/", include("tasks.urls")),
    path("api/live-locations/", include("live_locations.urls")),
    path("api/compliance/", include("compliance.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
