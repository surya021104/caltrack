from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import LeaveRequestViewSet, NotificationsView

router = DefaultRouter()
router.register(r"", LeaveRequestViewSet, basename="leave")

urlpatterns = router.urls + [
    path("notifications/", NotificationsView.as_view(), name="leave-notifications"),
]
