from django.urls import path

from .views import (
    LiveLocationUpdateView,
    CurrentLocationsListView,
    EmployeeLocationHistoryView,
    EmployeeLiveSessionDetailView,
    SOSView,
    SOSDetailView,
    GeofenceBreachListView,
    LiveHeatmapView,
    ETAPredictionView,
)

urlpatterns = [
    # Existing
    path("update/", LiveLocationUpdateView.as_view(), name="live-location-update"),
    path("current/", CurrentLocationsListView.as_view(), name="current-locations"),
    path("history/<str:employee_id>/", EmployeeLocationHistoryView.as_view(), name="employee-location-history"),
    path("session/<str:time_log_id>/", EmployeeLiveSessionDetailView.as_view(), name="session-detail"),
    # Layer 4 additions
    path("sos/", SOSView.as_view(), name="sos-list-create"),
    path("sos/<int:sos_id>/", SOSDetailView.as_view(), name="sos-detail"),
    path("breaches/", GeofenceBreachListView.as_view(), name="geofence-breaches"),
    path("heatmap/", LiveHeatmapView.as_view(), name="live-heatmap"),
    path("eta/", ETAPredictionView.as_view(), name="eta-prediction"),
]
