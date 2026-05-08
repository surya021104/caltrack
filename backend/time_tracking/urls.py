from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminEmployeeTimeLogsView,
    BreakEndView,
    BreakStartView,
    ClockInView,
    ClockOutView,
    TimeGeofenceStatusView,
    TimeLogViewSet,
    TimesheetView,
    UploadJobPhotoView,
    JobSitePhotosView,
    JobSiteViewSet,
    LocationViewSet,
    LocationZoneViewSet,
    EmployeeLocationViewSet,
    LocationOverviewView,
    TimeLogSubmitView,
    TimeLogApprovalView,
    CurrentSessionView,
    GeofenceValidatePointView,  # Phase 3 — dry-run geofence check
)

router = DefaultRouter()
router.register(r"logs", TimeLogViewSet, basename="time-log")
router.register(r"sites", JobSiteViewSet, basename="job-site")
router.register(r"locations", LocationViewSet, basename="saved-location")
router.register(r"zones", LocationZoneViewSet, basename="location-zone")
router.register(r"employee-locations", EmployeeLocationViewSet, basename="employee-location")

urlpatterns = [
    path("clock-in/", ClockInView.as_view(), name="clock-in"),
    path("clock-out/", ClockOutView.as_view(), name="clock-out"),
    path("current-session/", CurrentSessionView.as_view(), name="current-session"),
    path("break/start/", BreakStartView.as_view(), name="break-start"),
    path("break/end/", BreakEndView.as_view(), name="break-end"),
    path("timesheets/", TimesheetView.as_view(), name="timesheets"),
    path("geofence-status/", TimeGeofenceStatusView.as_view(), name="geofence-status"),
    path("admin/employees/<str:employee_id>/logs/", AdminEmployeeTimeLogsView.as_view(), name="admin-employee-logs"),
    path("photos/upload/", UploadJobPhotoView.as_view(), name="upload-job-photo"),
    path("photos/job-site/", JobSitePhotosView.as_view(), name="job-site-photos"),
    path("logs/<str:pk>/submit/", TimeLogSubmitView.as_view(), name="time-log-submit"),
    path("logs/<str:pk>/approve/", TimeLogApprovalView.as_view(), name="time-log-approve"),
    # Layer 2 — Admin location overview (live map with employee counts)
    path("locations/overview/", LocationOverviewView.as_view(), name="location-overview"),
    # Phase 3 (Layer 3) — Dry-run geofence validation for the frontend
    path("geofence/validate-point/", GeofenceValidatePointView.as_view(), name="geofence-validate-point"),
]

urlpatterns += router.urls
