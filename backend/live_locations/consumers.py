"""
Django Channels WebSocket consumers for live GPS tracking.

Two consumers:
  EmployeeLocationConsumer  –  employee sends GPS pings & SOS alerts
  AdminMapConsumer          –  admin receives real-time map updates
"""
import json
import math

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone


# ── Haversine distance (metres) ────────────────────────────────────────────

def haversine_meters(lat1, lon1, lat2, lon2):
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Tenant helper ──────────────────────────────────────────────────────────

def _set_tenant(company):
    """Switch the current DB connection to the company's schema."""
    from django.db import connection
    if company and hasattr(connection, "set_tenant"):
        connection.set_tenant(company)


# ──────────────────────────────────────────────────────────────────────────
# Employee consumer
# ──────────────────────────────────────────────────────────────────────────

class EmployeeLocationConsumer(AsyncWebsocketConsumer):
    """
    Receives GPS pings from a clocked-in employee, persists them, checks
    geofence compliance, and broadcasts updates to the admin group.

    Supported incoming message types:
      location_ping  – { type, lat, lng, accuracy }
      sos            – { type, lat, lng }
    """

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def connect(self):
        user = self.scope.get("user")
        company = self.scope.get("company")

        if not user or not getattr(user, "pk", None):
            await self.close(code=4001)
            return

        self.user = user
        self.company = company
        self.company_id = str(company.id) if company else None

        self.employee = await self._get_employee()
        if not self.employee:
            await self.close(code=4002)
            return

        self.employee_group = f"employee_{self.employee.id}"
        await self.channel_layer.group_add(self.employee_group, self.channel_name)

        await self.accept()
        await self.send(json.dumps({"type": "connected", "message": "Location tracking active"}))

    async def disconnect(self, close_code):
        if hasattr(self, "employee_group"):
            await self.channel_layer.group_discard(self.employee_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return

        msg_type = data.get("type")
        try:
            if msg_type == "location_ping":
                await self._handle_location_ping(data)
            elif msg_type == "sos":
                await self._handle_sos(data)
        except Exception as exc:
            await self.send(json.dumps({"type": "error", "message": str(exc)}))

    # ── Message handlers ──────────────────────────────────────────────────

    async def _handle_location_ping(self, data):
        lat = data.get("lat")
        lng = data.get("lng")
        accuracy = data.get("accuracy", 0)

        if lat is None or lng is None:
            return

        result = await self._save_ping_and_check(float(lat), float(lng), float(accuracy or 0))
        if not result:
            return

        ping_data, breach = result

        if self.company_id:
            await self.channel_layer.group_send(
                f"live_admin_{self.company_id}",
                {"type": "employee_ping", "data": ping_data, "breach": breach},
            )

        await self.send(json.dumps({
            "type": "ping_ack",
            "timestamp": ping_data.get("timestamp"),
            "geofence_ok": breach is None,
        }))

    async def _handle_sos(self, data):
        lat = data.get("lat")
        lng = data.get("lng")

        sos_data = await self._save_sos(
            float(lat) if lat is not None else None,
            float(lng) if lng is not None else None,
        )

        if sos_data and self.company_id:
            await self.channel_layer.group_send(
                f"live_admin_{self.company_id}",
                {"type": "employee_sos", "data": sos_data},
            )

        await self.send(json.dumps({"type": "sos_ack", "message": "SOS sent to admin"}))

    # Receive task-assignment push from admin
    async def task_assigned(self, event):
        await self.send(json.dumps({"type": "task_assigned", "task": event.get("task")}))

    # ── DB helpers (run in sync thread with tenant set) ───────────────────

    @database_sync_to_async
    def _get_employee(self):
        _set_tenant(self.company)
        from employees.models import Employee
        return (
            Employee.objects.select_related("user", "assigned_job_site")
            .filter(user=self.user)
            .first()
        )

    @database_sync_to_async
    def _save_ping_and_check(self, lat: float, lng: float, accuracy: float):
        _set_tenant(self.company)
        import traceback
        from decimal import Decimal

        from time_tracking.models import Break, TimeLog
        from .models import EmployeeLocation, GeofenceBreach

        try:
            lat_d = round(Decimal(str(lat)), 6)
            lng_d = round(Decimal(str(lng)), 6)

            time_log = (
                TimeLog.objects.filter(employee=self.employee, clock_out__isnull=True)
                .select_related("location")
                .order_by("-clock_in")
                .first()
            )

            loc = EmployeeLocation.objects.create(
                employee=self.employee,
                time_log=time_log,
                lat=lat_d,
                lng=lng_d,
            )

            # ── Presence status ───────────────────────────────────────────
            if not time_log:
                status = "offline"
            elif Break.objects.filter(time_log=time_log, break_end__isnull=True).exists():
                status = "on_break"
            else:
                status = "active"

            # ── Geofence check ────────────────────────────────────────────
            breach = None
            check_loc = None
            if time_log and time_log.location:
                check_loc = time_log.location
            elif getattr(self.employee, "assigned_job_site", None):
                check_loc = self.employee.assigned_job_site

            if check_loc and time_log:
                radius = getattr(check_loc, "geofence_radius", None) or 300
                dist = haversine_meters(lat, lng, float(check_loc.lat), float(check_loc.lng))

                if dist > radius:
                    status = "outside_geofence"
                    gb = GeofenceBreach.objects.create(
                        employee=self.employee,
                        time_log=time_log,
                        lat=lat_d,
                        lng=lng_d,
                        location_name=check_loc.name,
                        distance_meters=int(dist),
                        geofence_radius=radius,
                    )
                    breach = {
                        "id": str(gb.id),
                        "employee_name": (
                            self.employee.user.get_full_name() or self.employee.user.username
                        ),
                        "employee_id": str(self.employee.id),
                        "location": gb.location_name,
                        "distance_meters": gb.distance_meters,
                        "lat": str(lat_d),
                        "lng": str(lng_d),
                        "timestamp": gb.timestamp.isoformat(),
                    }

            # ── Build ping payload ────────────────────────────────────────
            worked_seconds = (
                int((timezone.now() - time_log.clock_in).total_seconds()) if time_log else 0
            )
            clock_in_photo = None
            if time_log and time_log.clock_in_photo:
                clock_in_photo = time_log.clock_in_photo.url

            job_site_name = check_loc.name if check_loc else "Corporate"

            ping_data = {
                "employee_id": str(self.employee.id),
                "employee_name": (
                    self.employee.user.get_full_name() or self.employee.user.username
                ),
                "lat": str(lat_d),
                "lng": str(lng_d),
                "accuracy": accuracy,
                "timestamp": loc.timestamp.isoformat(),
                "status": status,
                "worked_seconds": worked_seconds,
                "time_log_id": str(time_log.id) if time_log else None,
                "clock_in_photo": clock_in_photo,
                "job_site_name": job_site_name,
                "clock_in": time_log.clock_in.isoformat() if time_log else None,
            }

            return ping_data, breach

        except Exception as exc:
            traceback.print_exc()
            print(f"[WS] save_ping_and_check error: {exc}")
            return None

    @database_sync_to_async
    def _save_sos(self, lat, lng):
        _set_tenant(self.company)
        from decimal import Decimal

        from time_tracking.models import TimeLog
        from .models import SOSAlert

        try:
            time_log = (
                TimeLog.objects.filter(employee=self.employee, clock_out__isnull=True)
                .order_by("-clock_in")
                .first()
            )

            lat_d = round(Decimal(str(lat)), 6) if lat is not None else None
            lng_d = round(Decimal(str(lng)), 6) if lng is not None else None

            sos = SOSAlert.objects.create(
                employee=self.employee,
                time_log=time_log,
                lat=lat_d,
                lng=lng_d,
            )

            return {
                "id": str(sos.id),
                "employee_name": (
                    self.employee.user.get_full_name() or self.employee.user.username
                ),
                "employee_id": str(self.employee.id),
                "lat": str(lat_d) if lat_d is not None else None,
                "lng": str(lng_d) if lng_d is not None else None,
                "timestamp": sos.triggered_at.isoformat(),
                "status": "active",
            }

        except Exception as exc:
            print(f"[WS] save_sos error: {exc}")
            return None


# ──────────────────────────────────────────────────────────────────────────
# Admin map consumer
# ──────────────────────────────────────────────────────────────────────────

class AdminMapConsumer(AsyncWebsocketConsumer):
    """
    Admin-side WebSocket consumer.  Joins the company's admin broadcast group
    and relays all employee pings, SOS alerts, and geofence breaches to the
    connected admin browser.

    Supported incoming message types:
      assign_task      – { type, task_id, employee_id }
      acknowledge_sos  – { type, sos_id }
    """

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def connect(self):
        user = self.scope.get("user")
        company = self.scope.get("company")

        if not user or not getattr(user, "pk", None):
            await self.close(code=4001)
            return

        if getattr(user, "role", "") not in ("admin", "manager"):
            await self.close(code=4003)
            return

        self.user = user
        self.company = company
        self.company_id = str(company.id) if company else None

        if not self.company_id:
            await self.close(code=4004)
            return

        self.admin_group = f"live_admin_{self.company_id}"
        await self.channel_layer.group_add(self.admin_group, self.channel_name)
        await self.accept()

        # Send initial snapshot so admin has data before any employee pings
        snapshot = await self._get_snapshot()
        await self.send(json.dumps({"type": "snapshot", **snapshot}))

    async def disconnect(self, close_code):
        if hasattr(self, "admin_group"):
            await self.channel_layer.group_discard(self.admin_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return

        msg_type = data.get("type")
        try:
            if msg_type == "assign_task":
                await self._handle_task_assignment(data)
            elif msg_type == "acknowledge_sos":
                await self._handle_sos_ack(data)
            elif msg_type == "ping":
                await self.send(json.dumps({"type": "pong"}))
        except Exception:
            pass

    # ── Admin actions ──────────────────────────────────────────────────────

    async def _handle_task_assignment(self, data):
        task_id = data.get("task_id")
        employee_id = data.get("employee_id")
        if not task_id or not employee_id:
            return

        result = await self._assign_task(task_id, employee_id)
        if result:
            # Push to employee's personal channel
            await self.channel_layer.group_send(
                f"employee_{employee_id}",
                {"type": "task_assigned", "task": result},
            )
            await self.send(json.dumps({"type": "task_assigned_ack", "task": result}))

    async def _handle_sos_ack(self, data):
        sos_id = data.get("sos_id")
        if not sos_id:
            return

        await self._ack_sos(sos_id)
        await self.channel_layer.group_send(
            self.admin_group,
            {
                "type": "sos_acknowledged",
                "sos_id": sos_id,
                "acknowledged_by": (
                    self.user.get_full_name() or self.user.username
                ),
            },
        )

    # ── Group message handlers (type names use underscores for Channels) ──

    async def employee_ping(self, event):
        await self.send(json.dumps({
            "type": "employee_ping",
            "data": event.get("data"),
            "breach": event.get("breach"),
        }))

    async def employee_sos(self, event):
        await self.send(json.dumps({
            "type": "sos_alert",
            "data": event.get("data"),
        }))

    async def sos_acknowledged(self, event):
        await self.send(json.dumps({
            "type": "sos_acknowledged",
            "sos_id": event.get("sos_id"),
            "acknowledged_by": event.get("acknowledged_by"),
        }))

    async def task_assigned(self, event):
        await self.send(json.dumps({
            "type": "task_assigned",
            "task": event.get("task"),
        }))

    # ── DB helpers ─────────────────────────────────────────────────────────

    @database_sync_to_async
    def _get_snapshot(self):
        _set_tenant(self.company)
        from .views import build_live_snapshot
        return build_live_snapshot(self.company)

    @database_sync_to_async
    def _assign_task(self, task_id, employee_id):
        _set_tenant(self.company)
        from tasks.models import Task
        from employees.models import Employee

        try:
            task = Task.objects.get(id=task_id)
            employee = Employee.objects.select_related("user").get(id=employee_id)
            task.assigned_to = employee.user
            task.save(update_fields=["assigned_to", "updated_at"])
            return {
                "id": str(task.id),
                "title": task.title,
                "employee_id": str(employee.id),
                "employee_name": (employee.user.get_full_name() or employee.user.username),
                "priority": task.priority,
            }
        except Exception as exc:
            print(f"[WS] assign_task error: {exc}")
            return None

    @database_sync_to_async
    def _ack_sos(self, sos_id):
        _set_tenant(self.company)
        from .models import SOSAlert

        SOSAlert.objects.filter(id=sos_id).update(
            status="acknowledged",
            acknowledged_by=self.user,
            acknowledged_at=timezone.now(),
        )
