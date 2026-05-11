from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    OTRiskDashboardView,
    UK48HrMonitorView,
    HolidayAccrualViewSet,
    EmployeeHolidayAccrualView,
    RightToWorkViewSet,
    RTWExpiryCheckView,
    WTROptOutViewSet,
    AuditLogListView,
    BreakAttestationView,
    WageFloorCheckView,
    ExemptStatusView,
    BreakComplianceReportView,
    AuditLogExportView,
    RTIFPSExportView,
    RTWAlertEmailView,
)

router = DefaultRouter()
router.register("holiday-accrual", HolidayAccrualViewSet, basename="holiday-accrual")
router.register("rtw", RightToWorkViewSet, basename="rtw")
router.register("wtr-optout", WTROptOutViewSet, basename="wtr-optout")

urlpatterns = [
    path("", include(router.urls)),
    path("ot-risk/", OTRiskDashboardView.as_view(), name="ot-risk-dashboard"),
    path("uk-48hr/", UK48HrMonitorView.as_view(), name="uk-48hr-monitor"),
    path("uk-48hr/<int:employee_id>/", UK48HrMonitorView.as_view(), name="uk-48hr-employee"),
    path("holiday-accrual/accrue/<int:employee_id>/", EmployeeHolidayAccrualView.as_view(), name="holiday-accrue"),
    path("rtw/expiry-check/", RTWExpiryCheckView.as_view(), name="rtw-expiry-check"),
    path("rtw/send-alerts/", RTWAlertEmailView.as_view(), name="rtw-send-alerts"),
    path("audit-log/", AuditLogListView.as_view(), name="audit-log"),
    path("audit-log/export/", AuditLogExportView.as_view(), name="audit-log-export"),
    path("break-attestation/", BreakAttestationView.as_view(), name="break-attestation"),
    path("wage-floor/", WageFloorCheckView.as_view(), name="wage-floor"),
    path("exempt-status/<int:employee_id>/", ExemptStatusView.as_view(), name="exempt-status"),
    path("break-compliance/", BreakComplianceReportView.as_view(), name="break-compliance"),
    path("rti-fps/", RTIFPSExportView.as_view(), name="rti-fps-export"),
]
