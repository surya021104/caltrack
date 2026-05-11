"""
live_locations REST views.

Endpoints:
  POST /api/live-locations/update/            – employee sends a GPS ping
  GET  /api/live-locations/current/           – admin: latest ping per employee
  GET  /api/live-locations/history/<emp_id>/  – admin: ping history for employee
  GET  /api/live-locations/session/<log_id>/  – admin: full session detail

  POST /api/live-locations/sos/               – employee sends SOS (REST fallback)
  GET  /api/live-locations/sos/               – admin: list active SOS alerts
  PATCH /api/live-locations/sos/<id>/         – admin: acknowledge SOS

  GET  /api/live-locations/breaches/          – admin: geofence breach log
  GET  /api/live-locations/heatmap/           – admin: aggregated ping coords for today
  GET  /api/live-locations/eta/               – admin: ETA from each employee to a point
"""
import math
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from employees.models import Employee
from time_tracking.models import TimeLog
from .models import EmployeeLocation, GeofenceBreach, SOSAlert
from .serializers import EmployeeLocationSerializer


# ── Haversine helper (shared with consumers.py) ───────────────────────────────

def _haversine_meters(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Snapshot helper (called by AdminMapConsumer on connect) ───────────────────

def build_live_snapshot(company):
    """
    Return a JSON-serialisable dict with:
      employees  – one entry per clocked-in employee with latest ping/position
      sos_alerts – active SOS alerts
    """
    now = timezone.now()
    open_logs = (
        TimeLog.objects.filter(clock_out__isnull=True)
        .select_related("employee", "employee__user", "employee__assigned_job_site", "location")
        .order_by("employee", "-clock_in")
        .distinct("employee")
    )

    employees = []
    seen = set()

    for log in open_logs:
        emp = log.employee
        if emp.id in seen:
            continue
        seen.add(emp.id)

        latest_ping = (
            EmployeeLocation.objects.filter(employee=emp)
            .order_by("-timestamp")
            .first()
        )

        # Determine status
        from time_tracking.models import Break
        on_break = Break.objects.filter(time_log=log, break_end__isnull=True).exists()

        if on_break:
            status_val = "on_break"
        elif latest_ping:
            age_min = (now - latest_ping.timestamp).total_seconds() / 60
            if age_min > 30:
                status_val = "offline"
            elif age_min > 15:
                status_val = "idle"
            else:
                status_val = "active"
        else:
            status_val = "active"

        # Check geofence for latest ping
        check_loc = log.location or getattr(emp, "assigned_job_site", None)
        if check_loc and latest_ping and status_val == "active":
            radius = getattr(check_loc, "geofence_radius", None) or 300
            dist = _haversine_meters(
                float(latest_ping.lat), float(latest_ping.lng),
                float(check_loc.lat), float(check_loc.lng),
            )
            if dist > radius:
                status_val = "outside_geofence"

        if latest_ping:
            lat = str(latest_ping.lat)
            lng = str(latest_ping.lng)
            last_seen = latest_ping.timestamp.isoformat()
        else:
            lat = str(log.clock_in_lat or 0)
            lng = str(log.clock_in_lon or 0)
            last_seen = log.clock_in.isoformat()

        worked_seconds = int((now - log.clock_in).total_seconds())

        clock_in_photo = None
        if log.clock_in_photo:
            clock_in_photo = log.clock_in_photo.url

        job_site_name = (
            check_loc.name if check_loc else "Corporate"
        )

        employees.append({
            "employee_id": str(emp.id),
            "employee_name": emp.user.get_full_name() or emp.user.username,
            "lat": lat,
            "lng": lng,
            "timestamp": last_seen,
            "status": status_val,
            "worked_seconds": worked_seconds,
            "time_log_id": str(log.id),
            "clock_in_photo": clock_in_photo,
            "job_site_name": job_site_name,
            "clock_in": log.clock_in.isoformat(),
        })

    # Active SOS alerts
    sos_list = []
    for sos in SOSAlert.objects.filter(status="active").select_related("employee", "employee__user"):
        sos_list.append({
            "id": str(sos.id),
            "employee_id": str(sos.employee.id),
            "employee_name": sos.employee.user.get_full_name() or sos.employee.user.username,
            "lat": str(sos.lat) if sos.lat is not None else None,
            "lng": str(sos.lng) if sos.lng is not None else None,
            "timestamp": sos.triggered_at.isoformat(),
            "status": sos.status,
        })

    return {"employees": employees, "sos_alerts": sos_list}


# ── Existing views (kept intact) ──────────────────────────────────────────────

class LiveLocationUpdateView(APIView):
    """Employee reports their live location (REST polling fallback)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            company = getattr(request, "company", None)
            employee = Employee.objects.filter(user=request.user, company=company).first()
            if not employee:
                return Response({"detail": "Employee profile not found."}, status=status.HTTP_404_NOT_FOUND)

            time_log = (
                TimeLog.objects.filter(employee=employee, clock_out__isnull=True)
                .order_by("-clock_in")
                .first()
            )
            if not time_log:
                return Response(
                    {"detail": "You must be clocked in to report live location."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            lat = request.data.get("lat")
            lng = request.data.get("lng")
            if lat is None or lng is None:
                return Response(
                    {"detail": "Latitude and longitude are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from decimal import Decimal
            lat_d = round(Decimal(str(lat)), 6)
            lng_d = round(Decimal(str(lng)), 6)

            location = EmployeeLocation.objects.create(
                employee=employee, time_log=time_log, lat=lat_d, lng=lng_d
            )
            return Response(
                EmployeeLocationSerializer(location, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CurrentLocationsListView(APIView):
    """Returns the latest location for all currently clocked-in employees."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        from django.db.models import OuterRef, Subquery

        company = getattr(request, "company", None)

        latest_loc_id_subquery = (
            EmployeeLocation.objects.filter(time_log=OuterRef("pk"))
            .order_by("-timestamp")
            .values("id")[:1]
        )

        open_logs = (
            TimeLog.objects.filter(clock_out__isnull=True, employee__company=company)
            .annotate(latest_location_id=Subquery(latest_loc_id_subquery))
            .select_related("employee", "employee__user", "employee__assigned_job_site")
        )

        loc_ids = [l.latest_location_id for l in open_logs if l.latest_location_id]
        locations_dict = {
            loc.id: loc for loc in EmployeeLocation.objects.filter(id__in=loc_ids)
        }

        results = []
        for log in open_logs:
            latest_loc = locations_dict.get(log.latest_location_id)
            if latest_loc:
                results.append(
                    EmployeeLocationSerializer(latest_loc, context={"request": request}).data
                )
            else:
                clock_in_photo_url = None
                if log.clock_in_photo:
                    clock_in_photo_url = request.build_absolute_uri(log.clock_in_photo.url)
                delta = timezone.now() - log.clock_in
                results.append({
                    "id": f"clockin_{log.id}",
                    "employee": str(log.employee.id),
                    "employee_id_code": log.employee.employee_id,
                    "employee_name": (
                        log.employee.user.get_full_name() or log.employee.user.username
                    ),
                    "time_log": str(log.id),
                    "lat": log.clock_in_lat or 0,
                    "lng": log.clock_in_lon or 0,
                    "timestamp": log.clock_in,
                    "clock_in": log.clock_in,
                    "clock_in_photo": clock_in_photo_url,
                    "clock_in_address": log.clock_in_address,
                    "worked_seconds": int(delta.total_seconds()),
                    "job_site_name": (
                        log.employee.assigned_job_site.name
                        if log.employee.assigned_job_site
                        else "Corporate"
                    ),
                    "is_initial": True,
                })

        return Response(results)


class EmployeeLocationHistoryView(APIView):
    """Location history for a specific employee."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request, employee_id):
        time_log_id = request.query_params.get("time_log_id")
        company = getattr(request, "company", None)
        qs = EmployeeLocation.objects.filter(
            employee_id=employee_id, employee__company=company
        )
        if time_log_id:
            qs = qs.filter(time_log_id=time_log_id)
        else:
            one_day_ago = timezone.now() - timezone.timedelta(days=1)
            qs = qs.filter(timestamp__gte=one_day_ago)
        qs = qs.order_by("timestamp")
        return Response(EmployeeLocationSerializer(qs, many=True).data)


class EmployeeLiveSessionDetailView(APIView):
    """Full details for a specific live session (TimeLog)."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request, time_log_id):
        company = getattr(request, "company", None)
        log = (
            TimeLog.objects.filter(id=time_log_id, employee__company=company)
            .select_related("employee", "employee__user")
            .first()
        )
        if not log:
            return Response({"detail": "Time log not found."}, status=status.HTTP_404_NOT_FOUND)

        history = EmployeeLocation.objects.filter(time_log=log).order_by("timestamp")
        history_data = EmployeeLocationSerializer(
            history, many=True, context={"request": request}
        ).data

        photos = []
        for p in log.photos.all():
            photos.append({
                "id": str(p.id),
                "url": request.build_absolute_uri(p.photo.url) if p.photo else None,
                "type": p.photo_type,
                "caption": p.caption,
                "uploaded_at": p.uploaded_at,
            })

        clock_in_photo = (
            request.build_absolute_uri(log.clock_in_photo.url)
            if log.clock_in_photo
            else None
        )

        return Response({
            "id": str(log.id),
            "employee_name": (log.employee.user.get_full_name() or log.employee.user.username),
            "employee_id_code": log.employee.employee_id,
            "clock_in": log.clock_in,
            "clock_out": log.clock_out,
            "clock_in_photo": clock_in_photo,
            "clock_in_address": log.clock_in_address,
            "clock_in_notes": log.clock_in_notes,
            "worked_seconds": (
                log.worked_seconds()
                if log.clock_out
                else int((timezone.now() - log.clock_in).total_seconds())
            ),
            "job_site_name": (
                log.employee.assigned_job_site.name
                if log.employee.assigned_job_site
                else "Corporate"
            ),
            "photos": photos,
            "history": history_data,
        })


# ── Layer 4: New REST views ───────────────────────────────────────────────────

class SOSView(APIView):
    """
    GET  – admin lists active/all SOS alerts
    POST – employee sends SOS (REST fallback when WebSocket is unavailable)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ("admin", "manager"):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        company = getattr(request, "company", None)
        alert_status = request.query_params.get("status", "active")
        qs = SOSAlert.objects.filter(
            employee__company=company
        ).select_related("employee", "employee__user", "acknowledged_by")

        if alert_status != "all":
            qs = qs.filter(status=alert_status)

        data = []
        for sos in qs[:50]:
            data.append({
                "id": str(sos.id),
                "employee_id": str(sos.employee.id),
                "employee_name": (
                    sos.employee.user.get_full_name() or sos.employee.user.username
                ),
                "lat": str(sos.lat) if sos.lat is not None else None,
                "lng": str(sos.lng) if sos.lng is not None else None,
                "timestamp": sos.triggered_at.isoformat(),
                "status": sos.status,
                "acknowledged_by": (
                    sos.acknowledged_by.get_full_name() if sos.acknowledged_by else None
                ),
                "acknowledged_at": (
                    sos.acknowledged_at.isoformat() if sos.acknowledged_at else None
                ),
            })

        return Response(data)

    def post(self, request):
        """Employee triggers SOS via REST (WebSocket fallback)."""
        company = getattr(request, "company", None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=status.HTTP_404_NOT_FOUND)

        time_log = (
            TimeLog.objects.filter(employee=employee, clock_out__isnull=True)
            .order_by("-clock_in")
            .first()
        )

        from decimal import Decimal
        lat = request.data.get("lat")
        lng = request.data.get("lng")
        lat_d = round(Decimal(str(lat)), 6) if lat is not None else None
        lng_d = round(Decimal(str(lng)), 6) if lng is not None else None

        sos = SOSAlert.objects.create(
            employee=employee,
            time_log=time_log,
            lat=lat_d,
            lng=lng_d,
        )

        # Also push via WebSocket channel layer if available
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            channel_layer = get_channel_layer()
            if channel_layer and company:
                sos_data = {
                    "id": str(sos.id),
                    "employee_name": employee.user.get_full_name() or employee.user.username,
                    "employee_id": str(employee.id),
                    "lat": str(lat_d) if lat_d is not None else None,
                    "lng": str(lng_d) if lng_d is not None else None,
                    "timestamp": sos.triggered_at.isoformat(),
                    "status": "active",
                }
                async_to_sync(channel_layer.group_send)(
                    f"live_admin_{company.id}",
                    {"type": "employee_sos", "data": sos_data},
                )
        except Exception:
            pass

        return Response(
            {"id": str(sos.id), "message": "SOS alert sent."},
            status=status.HTTP_201_CREATED,
        )


class SOSDetailView(APIView):
    """PATCH to acknowledge or resolve a specific SOS alert."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def patch(self, request, sos_id):
        company = getattr(request, "company", None)
        sos = SOSAlert.objects.filter(id=sos_id, employee__company=company).first()
        if not sos:
            return Response({"detail": "SOS alert not found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status not in ("acknowledged", "resolved"):
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        sos.status = new_status
        sos.acknowledged_by = request.user
        sos.acknowledged_at = timezone.now()
        if request.data.get("notes"):
            sos.notes = request.data["notes"]
        sos.save()

        return Response({"id": str(sos.id), "status": sos.status})


class GeofenceBreachListView(APIView):
    """Admin: recent geofence breach log."""
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        company = getattr(request, "company", None)
        since_hours = int(request.query_params.get("hours", 24))
        since = timezone.now() - timezone.timedelta(hours=since_hours)

        qs = (
            GeofenceBreach.objects.filter(
                employee__company=company, timestamp__gte=since
            )
            .select_related("employee", "employee__user")
            .order_by("-timestamp")[:100]
        )

        data = [
            {
                "id": str(b.id),
                "employee_id": str(b.employee.id),
                "employee_name": (
                    b.employee.user.get_full_name() or b.employee.user.username
                ),
                "lat": str(b.lat),
                "lng": str(b.lng),
                "location": b.location_name,
                "distance_meters": b.distance_meters,
                "geofence_radius": b.geofence_radius,
                "timestamp": b.timestamp.isoformat(),
            }
            for b in qs
        ]
        return Response(data)


class LiveHeatmapView(APIView):
    """
    Admin: aggregated GPS ping positions for today.
    Returns an array of [lat, lng, weight] tuples for Leaflet.heat.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        company = getattr(request, "company", None)
        today = timezone.localdate()

        pings = (
            EmployeeLocation.objects.filter(
                employee__company=company,
                timestamp__date=today,
            )
            .values_list("lat", "lng")
        )

        # Group by rounded position to reduce payload
        from collections import Counter
        from decimal import Decimal

        counts = Counter()
        for lat, lng in pings:
            key = (round(float(lat), 4), round(float(lng), 4))
            counts[key] += 1

        points = [[lat, lng, min(count / 10, 1.0)] for (lat, lng), count in counts.items()]
        return Response({"points": points, "count": len(points)})


class ETAPredictionView(APIView):
    """
    Admin: calculate estimated arrival time for each clocked-in employee
    to reach a given lat/lng target.

    Query params:
      lat  – target latitude
      lng  – target longitude
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    AVG_SPEED_KMH = 25  # conservative urban travel speed

    def get(self, request):
        try:
            target_lat = float(request.query_params.get("lat", 0))
            target_lng = float(request.query_params.get("lng", 0))
        except (TypeError, ValueError):
            return Response({"detail": "Valid lat/lng required."}, status=status.HTTP_400_BAD_REQUEST)

        company = getattr(request, "company", None)
        now = timezone.now()

        open_logs = (
            TimeLog.objects.filter(clock_out__isnull=True)
            .select_related("employee", "employee__user")
        )

        results = []
        for log in open_logs:
            latest_ping = (
                EmployeeLocation.objects.filter(employee=log.employee)
                .order_by("-timestamp")
                .first()
            )

            if not latest_ping:
                continue

            emp_lat = float(latest_ping.lat)
            emp_lng = float(latest_ping.lng)
            distance_m = _haversine_meters(emp_lat, emp_lng, target_lat, target_lng)
            distance_km = distance_m / 1000
            eta_minutes = (distance_km / self.AVG_SPEED_KMH) * 60

            # Age of last ping
            ping_age_s = (now - latest_ping.timestamp).total_seconds()

            results.append({
                "employee_id": str(log.employee.id),
                "employee_name": (
                    log.employee.user.get_full_name() or log.employee.user.username
                ),
                "current_lat": emp_lat,
                "current_lng": emp_lng,
                "distance_meters": round(distance_m),
                "eta_minutes": round(eta_minutes, 1),
                "last_ping_age_seconds": round(ping_age_s),
                "stale": ping_age_s > 600,
            })

        results.sort(key=lambda x: x["eta_minutes"])
        return Response(results)
