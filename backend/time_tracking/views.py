from datetime import date, datetime, timedelta

from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from employees.models import Employee

from .models import Break, TimeLog, JobSite, TimeLogPhoto, Location, LocationZone, EmployeeLocation
from .serializers import (
    TimeLogSerializer, TimeLogPhotoSerializer, JobSiteSerializer,
    LocationSerializer, LocationZoneSerializer, EmployeeLocationSerializer,
)
from .utils import calculate_distance, generate_shift_summary_pdf, send_shift_summary_email, verify_face_match
from django.http import HttpResponse
from rest_framework.decorators import action


class JobSiteViewSet(viewsets.ModelViewSet):
    serializer_class = JobSiteSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.IsAuthenticated()]
        return [IsAdminRole()]

    def get_queryset(self):
        if not hasattr(self.request, 'company'):
            return JobSite.objects.none()
        # Filter by company instead of organization
        return JobSite.objects.filter(company=self.request.company).order_by("name")

    def perform_create(self, serializer):
        if hasattr(self.request, 'company'):
            serializer.save(company=self.request.company)
        else:
            serializer.save()


# ── NOTE (Phase 1) ────────────────────────────────────────────────────────
# A duplicate LocationViewSet used to live here. It has been removed in
# favour of the richer one further down (search "LAYER 2: Multi-location"),
# which supports the archived filter + admin-only write permissions.
# Keeping a single source of truth eliminates the import-order ambiguity.
# ──────────────────────────────────────────────────────────────────────────


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def _get_employee_for_request(request, employee_id: str | None) -> Employee | None:
    company = getattr(request, 'company', None)
    if request.user.role == "admin" and employee_id:
        return Employee.objects.filter(id=employee_id, company=company).first()
    return Employee.objects.filter(user=request.user, company=company).first()


class TimeLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TimeLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        time_log = self.get_object()
        pdf_content = generate_shift_summary_pdf(time_log)
        filename = f"Shift_Summary_{time_log.work_date}_{time_log.employee.user.username}.pdf"
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def get_queryset(self):
        if not hasattr(self.request, 'company'):
            return TimeLog.objects.none()
            
        # Filter through employee__company to isolate data
        qs = TimeLog.objects.filter(employee__company=self.request.company).select_related("employee", "employee__user").prefetch_related("breaks")

        # Date range filters (work_date)
        date_from = _parse_date(self.request.query_params.get("date_from"))
        date_to   = _parse_date(self.request.query_params.get("date_to"))
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)

        if self.request.user.role == "admin":
            return qs.order_by("-clock_in")
            
        employee = Employee.objects.filter(user=self.request.user, company=self.request.company).first()
        if not employee:
            return qs.none()
        return qs.filter(employee=employee).order_by("-clock_in")



class ClockInView(APIView):
    """Clock-in endpoint.

    Phase 2 refactor: all geofence decisioning is delegated to
    time_tracking.geo.evaluate(). The view now owns only:
      • authn lookup (employee → company)
      • duplicate-clock-in guard
      • request parsing (GPS, address, photo)
      • TimeLog persistence

    Response shapes are identical to the pre-refactor view so existing
    frontends (TimePage, mobile) keep parsing distance/radius/message
    unchanged. New clients can opt into the additional ``reason`` field.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from time_tracking.geo import evaluate, TenantMismatch

        company = getattr(request, "company", None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)

        open_log = TimeLog.objects.filter(employee=employee, clock_out__isnull=True).first()
        if open_log:
            return Response({"detail": "Already clocked in."}, status=400)

        now = timezone.now()
        lat = request.data.get("lat")
        lon = request.data.get("lon")
        address = request.data.get("address", "")
        notes = request.data.get("notes", "")
        photo = request.FILES.get("photo")

        # Resolve current shift (if any) so the engine can apply
        # shift–location enforcement. We fall back to None if the model
        # lookup misses; the engine treats None as "no shift constraint".
        active_shift = _find_active_shift(employee, now)

        try:
            decision = evaluate(
                employee=employee,
                company=company,
                lat=float(lat) if lat not in (None, "") else None,
                lng=float(lon) if lon not in (None, "") else None,
                shift=active_shift,
                is_admin=(getattr(request.user, "role", None) == "admin"),
                # Legacy behaviour granted admin override automatically when
                # the requesting user was an admin. Preserve that.
                request_admin_override=(getattr(request.user, "role", None) == "admin"),
            )
        except TenantMismatch:
            return Response({"detail": "Employee/company mismatch."}, status=403)

        # Strict block — return the legacy 403 body shape verbatim.
        if not decision.allowed:
            return Response(decision.to_block_response(), status=403)

        time_log = TimeLog.objects.create(
            employee=employee,
            work_date=timezone.localdate(),
            clock_in=now,
            clock_in_lat=lat,
            clock_in_lon=lon,
            clock_in_address=address,
            clock_in_notes=notes,
            clock_in_photo=photo,
            distance_from_site_meters=decision.distance_m,
            geofence_passed=decision.geofence_passed,
            admin_override_used=decision.admin_override_used,
            # Engine returns a Location *or* a JobSiteLocationAdapter wrapper.
            # TimeLog.location accepts only real Locations, so we filter.
            location=_unwrap_location(decision.matched_location),
        )
        return Response(TimeLogSerializer(time_log).data, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 helpers used by ClockInView
# ─────────────────────────────────────────────────────────────────────────────
def _find_active_shift(employee, now):
    """Returns the Shift currently in progress for the employee, or None.

    A shift is "active" if shift_start <= now <= shift_end. Using the
    earliest matching shift keeps behaviour deterministic when overlap
    exists (rare; admins rarely double-book).
    """
    try:
        from scheduling.models import Shift  # local import to avoid cycle
        return (
            Shift.objects
            .filter(employee=employee, shift_start__lte=now, shift_end__gte=now)
            .order_by("shift_start")
            .first()
        )
    except Exception:
        # Defensive: scheduling app could be temporarily unavailable.
        # Falling back to None means the engine treats this as no-shift,
        # which matches pre-Phase-2 behaviour exactly.
        return None


def _unwrap_location(loc):
    """Returns a real time_tracking.Location or None.

    The engine wraps a legacy JobSite in an adapter for distance math.
    TimeLog.location is a FK to Location, so we discard the adapter and
    let the FK stay null in that case (matches pre-refactor behaviour
    when employee had no Location assignments).
    """
    if loc is None:
        return None
    if isinstance(loc, Location):
        return loc
    return None


class ClockOutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        time_log = TimeLog.objects.filter(employee=employee, clock_out__isnull=True).order_by("-clock_in").first()
        if not time_log:
            return Response({"detail": "No open time log."}, status=400)
        open_break = Break.objects.filter(time_log=time_log, break_end__isnull=True).order_by("-break_start").first()
        if open_break:
            open_break.break_end = timezone.now()
            open_break.save(update_fields=["break_end"])
        time_log.clock_out = timezone.now()
        time_log.clock_out_lat = request.data.get("lat")
        time_log.clock_out_lon = request.data.get("lon")
        time_log.clock_out_address = request.data.get("address", "")
        time_log.clock_out_notes = request.data.get("notes", "")
        if "photo" in request.FILES:
            time_log.clock_out_photo = request.FILES["photo"]
        
        # Record face verification result from client-side check
        face_status = request.data.get("face_match_status")
        face_score = request.data.get("face_match_score")
        if face_status:
            time_log.face_match_status = face_status
        if face_score is not None:
            try:
                time_log.face_match_score = float(face_score)
            except (ValueError, TypeError):
                pass

        time_log.save()
        
        # If this time log is linked to a task, complete the task
        try:
            task = time_log.task
            if task and task.status != "completed":
                task.status = "completed"
                task.completed_at = timezone.now()
                if not task.started_at:
                    task.started_at = time_log.clock_in
                task.save()
        except (AttributeError, Exception):
            pass

        try:
            send_shift_summary_email(time_log)
        except Exception:
            pass
        
        return Response(TimeLogSerializer(time_log).data)


class BreakStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        time_log = TimeLog.objects.filter(employee=employee, clock_out__isnull=True).order_by("-clock_in").first()
        if not time_log:
            return Response({"detail": "No open time log."}, status=400)
        open_break = Break.objects.filter(time_log=time_log, break_end__isnull=True).first()
        if open_break:
            return Response({"detail": "Break already started."}, status=400)
        break_obj = Break.objects.create(
            time_log=time_log, 
            break_start=timezone.now(),
            break_type=request.data.get("break_type", "lunch")
        )
        time_log.refresh_from_db()
        return Response(TimeLogSerializer(time_log).data)


class BreakEndView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        time_log = TimeLog.objects.filter(employee=employee, clock_out__isnull=True).order_by("-clock_in").first()
        if not time_log:
            return Response({"detail": "No open time log."}, status=400)
        open_break = Break.objects.filter(time_log=time_log, break_end__isnull=True).order_by("-break_start").first()
        if not open_break:
            return Response({"detail": "No open break."}, status=400)
        open_break.break_end = timezone.now()
        open_break.save(update_fields=["break_end"])
        time_log.refresh_from_db()
        return Response(TimeLogSerializer(time_log).data)


class TimesheetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return self._handle_get(request)

    def _handle_get(self, request):
        employee = _get_employee_for_request(request, request.query_params.get("employee"))
        if not employee:
            # Admin user or user without an employee profile — return an empty valid response
            return Response({
                "employee": None,
                "range": {},
                "entries": [],
                "daily": [],
                "weekly": [],
                "totals": {"hours": 0, "daily_overtime_hours": 0, "weekly_overtime_hours": 0},
            })

        start = _parse_date(request.query_params.get("start")) or (timezone.localdate() - timedelta(days=7))
        end = _parse_date(request.query_params.get("end")) or timezone.localdate()

        qs = (
            TimeLog.objects.filter(employee=employee, work_date__gte=start, work_date__lte=end)
            .order_by("work_date", "clock_in")
        )

        entries = []
        daily_totals = {}
        for log in qs:
            worked_hours = log.worked_seconds() / 3600
            # Explicitly format dates and datetimes
            clock_in = log.clock_in.isoformat() if log.clock_in else None
            clock_out = log.clock_out.isoformat() if log.clock_out else None
            
            entries.append(
                {
                    "id": str(log.id),
                    "work_date": str(log.work_date),
                    "clock_in": clock_in,
                    "clock_in_lat": str(log.clock_in_lat) if log.clock_in_lat else None,
                    "clock_in_lon": str(log.clock_in_lon) if log.clock_in_lon else None,
                    "clock_in_address": log.clock_in_address,
                    "clock_in_notes": log.clock_in_notes,
                    "clock_in_photo": request.build_absolute_uri(log.clock_in_photo.url) if log.clock_in_photo else None,
                    "clock_out": clock_out,
                    "clock_out_lat": str(log.clock_out_lat) if log.clock_out_lat else None,
                    "clock_out_lon": str(log.clock_out_lon) if log.clock_out_lon else None,
                    "clock_out_address": log.clock_out_address,
                    "clock_out_notes": log.clock_out_notes,
                    "clock_out_photo": request.build_absolute_uri(log.clock_out_photo.url) if log.clock_out_photo else None,
                    "break_seconds": log.break_seconds(),
                    "worked_hours": round(worked_hours, 2),
                    "worked_seconds": log.worked_seconds(),
                }
            )
            daily_totals.setdefault(log.work_date, {"hours": 0.0, "seconds": 0})
            daily_totals[log.work_date]["hours"] += worked_hours
            daily_totals[log.work_date]["seconds"] += log.worked_seconds()

        daily = []
        total_hours = 0.0
        total_seconds = 0
        for d, data in sorted(daily_totals.items(), key=lambda x: str(x[0])):
            hours = data["hours"]
            seconds = data["seconds"]
            ot = max(0.0, hours - 8.0)
            daily.append({
                "date": str(d), 
                "hours": round(hours, 2), 
                "seconds": seconds,
                "overtime_hours": round(ot, 2),
            })
            total_hours += hours
            total_seconds += seconds

        # ✅ FIXED — extract just the float hours value
        weekly_hours = {}
        for d, data in daily_totals.items():
            y, w, _ = d.isocalendar()
            weekly_hours.setdefault((y, w), 0.0)
            weekly_hours[(y, w)] += data["hours"]  # ← extract hours from dict

        weekly = []
        for (y, w), hours in sorted(weekly_hours.items(), key=lambda x: str(x[0])):
            ot = max(0.0, hours - 40.0)
            weekly.append({"iso_year": y, "iso_week": w, "hours": round(hours, 2), "overtime_hours": round(ot, 2)})

        return Response(
            {
                "employee": {"id": str(employee.id), "employee_id": employee.employee_id},
                "range": {"start": str(start), "end": str(end)},
                "entries": entries,
                "daily": daily,
                "weekly": weekly,
                "totals": {
                    "hours": round(total_hours, 2),
                    "seconds": total_seconds,
                    "daily_overtime_hours": 0.0,
                    "weekly_overtime_hours": 0.0,
                },
            }
        )
        


class AdminEmployeeTimeLogsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request, employee_id: str):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(id=employee_id, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        qs = TimeLog.objects.filter(employee=employee).prefetch_related("breaks").order_by("-clock_in")
        return Response(TimeLogSerializer(qs, many=True).data)


class TimeGeofenceStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        
        job_site = employee.assigned_job_site
        company = getattr(request, 'company', None)
        
        data = {
            "geofence_enabled": company.geofence_enabled if company else False,
            "strict_mode": company.geofence_strict_mode if company else True,
            "admin_override": company.geofence_admin_override if company else True,
            "org_radius": company.geofence_radius_meters if company else 200,
            "job_site": None
        }
        
        if job_site:
            data["job_site"] = {
                "id": str(job_site.id),
                "name": job_site.name,
                "lat": float(job_site.lat),
                "lng": float(job_site.lng),
                "radius_override": job_site.geofence_radius
            }
            
        return Response(data)


class UploadJobPhotoView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        
        time_log = TimeLog.objects.filter(employee=employee, clock_out__isnull=True).order_by("-clock_in").first()
        if not time_log:
            return Response({"detail": "No active time log found. Please clock in first."}, status=400)
            
        photo = request.FILES.get("photo")
        photo_type = request.data.get("photo_type", "progress")
        caption = request.data.get("caption", "")
        
        if not photo:
            return Response({"detail": "No photo provided."}, status=400)
            
        log_photo = TimeLogPhoto.objects.create(
            time_log=time_log,
            photo=photo,
            photo_type=photo_type,
            caption=caption
        )
        
        return Response(TimeLogPhotoSerializer(log_photo).data, status=201)


class JobSitePhotosView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Admins see all, employees see their own (or all if needed, but let's stick to related logs)
        if request.user.role == "admin":
            company = getattr(request, 'company', None)
            qs = TimeLogPhoto.objects.filter(time_log__employee__company=company).select_related("time_log", "time_log__employee", "time_log__employee__user").order_by("-uploaded_at")
        else:
            employee = Employee.objects.filter(user=request.user, company=getattr(request, 'company', None)).first()
            if not employee:
                return Response([])
            qs = TimeLogPhoto.objects.filter(time_log__employee=employee).order_by("-uploaded_at")
            
        data = []
        for p in qs:
            data.append({
                "id": str(p.id),
                "photo": request.build_absolute_uri(p.photo.url) if p.photo else None,
                "photo_type": p.photo_type,
                "caption": p.caption,
                "uploaded_at": p.uploaded_at,
                "employee_name": p.time_log.employee.user.get_full_name() or p.time_log.employee.user.username,
                "time_log_id": str(p.time_log.id)
            })
        return Response(data)
class TimeLogSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: str):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        
        time_log = TimeLog.objects.filter(id=pk, employee=employee).first()
        if not time_log:
            return Response({"detail": "Time log not found."}, status=404)
        
        if time_log.clock_out is None:
            return Response({"detail": "Cannot submit an open time log. Please clock out first."}, status=400)
        
        if time_log.status != 'draft':
            return Response({"detail": f"Time log is already {time_log.status}."}, status=400)
        
        time_log.status = 'submitted'
        time_log.submitted_at = timezone.now()
        time_log.save(update_fields=['status', 'submitted_at'])
        
        return Response(TimeLogSerializer(time_log).data)


class TimeLogApprovalView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request, pk: str):
        action = request.data.get("action") # "approve", "reject", "edit"
        company = getattr(request, 'company', None)
        time_log = TimeLog.objects.filter(id=pk, employee__company=company).first()
        if not time_log:
            return Response({"detail": "Time log not found."}, status=404)
        
        if action == "approve":
            time_log.status = 'approved'
            time_log.approved_by = request.user
            time_log.admin_notes = request.data.get("admin_notes", "")
            time_log.save(update_fields=['status', 'approved_by', 'admin_notes'])
        
        elif action == "reject":
            time_log.status = 'rejected'
            time_log.admin_notes = request.data.get("admin_notes", "Rejected by admin.")
            time_log.save(update_fields=['status', 'admin_notes'])
            
        elif action == "edit":
            # Admin can adjust hours via manual_hours_correction
            try:
                correction = request.data.get("manual_hours_correction")
                if correction is not None:
                    time_log.manual_hours_correction = float(correction)
                time_log.admin_notes = request.data.get("admin_notes", time_log.admin_notes)
                time_log.save(update_fields=['manual_hours_correction', 'admin_notes'])
            except Exception as e:
                return Response({"detail": f"Invalid correction value: {e}"}, status=400)

        elif action == "force_clock_out":
            if not time_log.clock_out:
                time_log.clock_out = timezone.now()
                # Close any open breaks
                time_log.breaks.filter(break_end__isnull=True).update(break_end=timezone.now())
                time_log.admin_notes = request.data.get("admin_notes", f"Forced clock out by admin {request.user.username}")
                time_log.save(update_fields=['clock_out', 'admin_notes'])
            else:
                return Response({"detail": "Employee already clocked out."}, status=400)

        elif action == "delete":
            time_log.delete()
            return Response({"success": True, "detail": "Time log deleted."})
        
        return Response(TimeLogSerializer(time_log).data)


class CurrentSessionView(APIView):
    """Returns the currently active time log for the logged-in user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        company = getattr(request, 'company', None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)
        
        open_log = TimeLog.objects.filter(employee=employee, clock_out__isnull=True).order_by("-clock_in").first()
        if not open_log:
            return Response({"active": False})
            
        return Response({
            "active": True,
            "id": str(open_log.id),
            "clock_in": open_log.clock_in,
            "job_site": employee.assigned_job_site.name if employee.assigned_job_site else "Corporate"
        })


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2: Multi-location & Zone Management
# ═══════════════════════════════════════════════════════════════════════════════

class LocationViewSet(viewsets.ModelViewSet):
    """CRUD for org locations. Supports circle + polygon geofences."""
    serializer_class = LocationSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.IsAuthenticated()]
        return [IsAdminRole()]

    def get_queryset(self):
        company = getattr(self.request, 'company', None)
        if not company:
            return Location.objects.none()
        qs = Location.objects.filter(company=company)
        archived = self.request.query_params.get("archived", "false").lower()
        if archived == "true":
            return qs.filter(is_archived=True)
        return qs.filter(is_archived=False)

    def perform_create(self, serializer):
        # Phase 1: capture creator on the audit field. Falls back gracefully
        # for unauthenticated edge cases (which permission classes already
        # block, but keep this defensive).
        user = getattr(self.request, "user", None)
        created_by = user if (user and getattr(user, "is_authenticated", False)) else None
        serializer.save(company=self.request.company, created_by=created_by)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)


class LocationZoneViewSet(viewsets.ModelViewSet):
    """CRUD for location zones (named groups of locations)."""
    serializer_class = LocationZoneSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.IsAuthenticated()]
        return [IsAdminRole()]

    def get_queryset(self):
        company = getattr(self.request, 'company', None)
        if not company:
            return LocationZone.objects.none()
        return LocationZone.objects.filter(company=company).prefetch_related("locations")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)


class EmployeeLocationViewSet(viewsets.ModelViewSet):
    """Manage which locations an employee is permitted to clock in at."""
    serializer_class = EmployeeLocationSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        company = getattr(self.request, 'company', None)
        if not company:
            return EmployeeLocation.objects.none()
        qs = EmployeeLocation.objects.filter(
            employee__company=company
        ).select_related("employee__user", "location")
        employee_id = self.request.query_params.get("employee")
        location_id = self.request.query_params.get("location")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs


class LocationOverviewView(APIView):
    """
    Admin map overview — each location with live employee-on-site count.
    Used by the admin map to show colour-coded markers.

    Phase 3 enrichment: every location now also carries `violation_count`,
    `late_arrival_count`, `capacity`, `status`, and `geofence_type` so the
    frontend can paint the marker without a second round-trip.

    Phase 7 caching: response is memoised per tenant for the duration of
    `OVERVIEW_CACHE_SECONDS`. The frontend polls every 30s, so a 30s cache
    means each tenant sees at most one DB read per polling window even when
    50 admins have the dashboard open simultaneously. Cache is busted by
    a query-string param (`?fresh=1`), used by the manual Refresh button.
    """
    permission_classes = [IsAdminRole]

    # Status colours the dashboard expects.
    STATUS_INACTIVE = "inactive"
    STATUS_ALERT = "alert"
    STATUS_OVERCROWDED = "overcrowded"
    STATUS_ACTIVE = "active"

    # Late-arrival grace window — number of seconds after shift_start
    # before a clock-in is flagged "late". Tunable per-tenant in Phase 7.
    LATE_GRACE_SECONDS = 5 * 60

    # Phase 7: cache TTL. Match the frontend polling interval so we avoid
    # double-reads but still see fresh data within one cycle.
    OVERVIEW_CACHE_SECONDS = 30

    def get(self, request):
        company = getattr(request, 'company', None)
        if not company:
            return Response([])

        # Phase 7: locmem cache, keyed by tenant schema. Bypassed when
        # the client explicitly asks for fresh data via ?fresh=1.
        from django.core.cache import cache
        bust = request.query_params.get("fresh") in ("1", "true", "yes")
        cache_key = f"location_overview::{getattr(company, 'schema_name', company.id)}"
        if not bust:
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)

        locations = Location.objects.filter(company=company, is_archived=False)

        # Open time logs for the tenant — bounded scan, single query.
        active_logs = list(
            TimeLog.objects
            .filter(employee__company=company, clock_out__isnull=True)
            .select_related("location", "employee__user")
        )

        # Aggregate per-location signals in a single pass.
        on_site_employees: dict = {}
        violations_by_loc: dict = {}
        late_by_loc: dict = {}

        # Pre-load the active shifts so we can compute lateness without N
        # queries. Active = shift currently overlapping "now".
        from django.utils import timezone
        from scheduling.models import Shift  # local import: avoids cycles
        now = timezone.now()
        active_shifts = {
            s.employee_id: s
            for s in Shift.objects
                .filter(company=company, shift_start__lte=now, shift_end__gte=now)
        }

        for log in active_logs:
            lid = log.location_id
            if not lid:
                continue
            on_site_employees.setdefault(lid, []).append(
                log.employee.user.get_full_name() or log.employee.user.username
            )
            # Violation = clocked in but failed geofence and no admin override.
            if not log.geofence_passed and not log.admin_override_used:
                violations_by_loc[lid] = violations_by_loc.get(lid, 0) + 1
            # Late arrival = clocked in past shift_start + grace.
            shift = active_shifts.get(log.employee_id)
            if shift and shift.shift_start and log.clock_in:
                if (log.clock_in - shift.shift_start).total_seconds() > self.LATE_GRACE_SECONDS:
                    late_by_loc[lid] = late_by_loc.get(lid, 0) + 1

        result = []
        for loc in locations:
            ids = on_site_employees.get(loc.id, [])
            on_site_count = len(ids)
            violation_count = violations_by_loc.get(loc.id, 0)
            late_count = late_by_loc.get(loc.id, 0)

            # Capacity field is reserved for Phase 7 (no model column yet);
            # surface it as null so the frontend can render gracefully.
            capacity = None
            status = self._derive_status(loc, on_site_count, violation_count, capacity)

            result.append({
                "id": str(loc.id),
                "name": loc.name,
                "address": loc.address,
                "lat": loc.lat,
                "lng": loc.lng,
                "geofence_radius": loc.geofence_radius,
                "geofence_polygon": loc.geofence_polygon,
                "geofence_type": loc.geofence_type,
                "location_type": loc.location_type,
                "is_active": loc.is_active,
                "employee_count": loc.permitted_employees.count(),
                "on_site_count": on_site_count,
                "on_site_employees": ids,
                # Phase 3 NEW fields ────────────────────────────────────
                "violation_count": violation_count,
                "late_arrival_count": late_count,
                "capacity": capacity,
                "status": status,
            })

        # Phase 7: persist for OVERVIEW_CACHE_SECONDS (30s default).
        cache.set(cache_key, result, self.OVERVIEW_CACHE_SECONDS)
        return Response(result)

    @classmethod
    def _derive_status(cls, loc, on_site_count, violation_count, capacity):
        """Status colour rules (matches the architecture-doc taxonomy):
            inactive    → location is_active=False
            alert       → any open violations
            overcrowded → on_site > capacity (when capacity is set)
            active      → otherwise
        """
        if not loc.is_active:
            return cls.STATUS_INACTIVE
        if violation_count > 0:
            return cls.STATUS_ALERT
        if capacity is not None and on_site_count > capacity:
            return cls.STATUS_OVERCROWDED
        return cls.STATUS_ACTIVE


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — Geofence validate-point (dry-run check used by the frontend
# before clock-in). No DB writes; pure decision pass-through.
# ─────────────────────────────────────────────────────────────────────────────
class GeofenceValidatePointView(APIView):
    """POST /api/time/geofence/validate-point/

    Body:
        { "lat": 12.97, "lng": 80.04, "shift_id": "<optional uuid>" }

    Returns the same Decision the clock-in endpoint would, without
    creating a TimeLog. Used by TimePage to give instant "you're inside"
    / "you're 1.2km away" feedback before the user commits.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from time_tracking.geo import evaluate, TenantMismatch
        from time_tracking.geo.validators import validate_lat_lng

        company = getattr(request, "company", None)
        employee = Employee.objects.filter(user=request.user, company=company).first()
        if not employee:
            return Response({"detail": "Employee profile not found."}, status=404)

        # Coerce + range-check coordinates.
        try:
            lat, lng = validate_lat_lng(
                request.data.get("lat"),
                request.data.get("lng"),
            )
        except Exception as exc:
            # validators raises rest_framework.exceptions.ValidationError
            return Response({"detail": getattr(exc, "detail", str(exc))}, status=400)

        # Optional shift override — admin scheduling tools may pass a specific
        # shift_id to test. Otherwise we resolve the active shift like
        # ClockInView does.
        shift = None
        shift_id = request.data.get("shift_id")
        if shift_id:
            from scheduling.models import Shift
            shift = (
                Shift.objects
                .filter(id=shift_id, company=company, employee=employee)
                .first()
            )
            if not shift:
                return Response({"detail": "Shift not found."}, status=404)
        else:
            from django.utils import timezone
            shift = _find_active_shift(employee, timezone.now())

        try:
            decision = evaluate(
                employee=employee,
                company=company,
                lat=lat,
                lng=lng,
                shift=shift,
                is_admin=(getattr(request.user, "role", None) == "admin"),
                # Dry-run: NEVER auto-apply admin override. The caller can
                # opt in explicitly via request_admin_override=true.
                request_admin_override=bool(request.data.get("request_admin_override")),
            )
        except TenantMismatch:
            return Response({"detail": "Employee/company mismatch."}, status=403)

        # Shape — mirrors the architecture-doc API contract.
        matched = decision.matched_location
        matched_block = None
        if matched is not None:
            matched_block = {
                "id": str(getattr(matched, "id", "")) if getattr(matched, "id", None) else None,
                "name": getattr(matched, "name", None),
                "geofence_radius": getattr(matched, "geofence_radius", None),
                "geofence_type": getattr(matched, "geofence_type", "circle"),
            }

        shift_block = None
        if shift is not None:
            shift_loc_id = getattr(getattr(shift, "location", None), "id", None)
            shift_block = {
                "id": str(shift.id),
                "location_id": str(shift_loc_id) if shift_loc_id else None,
                "matches": (
                    matched is not None
                    and shift_loc_id is not None
                    and getattr(matched, "id", None) == shift_loc_id
                ),
                "enforcement_override": getattr(shift, "enforcement_override", "inherit"),
            }

        return Response({
            "allowed": decision.allowed,
            "decision": decision.reason,
            "mode": decision.mode,
            "matched_location": matched_block,
            "distance_m": decision.distance_m,
            "radius_m": decision.radius_m,
            "candidate_count": decision.candidate_count,
            "geofence_passed": decision.geofence_passed,
            "admin_override_used": decision.admin_override_used,
            "shift": shift_block,
        })
# end of views.py
