from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Task, TaskAttachment
from .serializers import TaskSerializer, TaskStatusUpdateSerializer


class IsAdmin(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "admin"


# ── Admin: full CRUD ──────────────────────────────────────────

from rest_framework.generics import GenericAPIView

class AdminTaskListCreateView(GenericAPIView):
    """
    GET  /api/tasks/admin/          → list all tasks (admin)
    POST /api/tasks/admin/          → create & assign a task (admin)
    """
    permission_classes = [IsAdmin]
    serializer_class = TaskSerializer

    def get(self, request):
        if not hasattr(request, 'company'):
            return Response([])
        qs = Task.objects.filter(company=request.company).select_related("assigned_to", "assigned_by")

        # Optional filters
        employee_id = request.query_params.get("employee")
        status_f    = request.query_params.get("status")
        due_date    = request.query_params.get("due_date")

        if employee_id:
            qs = qs.filter(assigned_to_id=employee_id)
        if status_f:
            qs = qs.filter(status=status_f)
        if due_date:
            qs = qs.filter(due_date=due_date)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        return Response(TaskSerializer(qs, many=True).data)

    def post(self, request):
        ser = TaskSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        task = ser.save(assigned_by=request.user, company=request.company)
        return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)


class AdminTaskDetailView(APIView):
    """
    GET    /api/tasks/admin/<pk>/   → retrieve
    PATCH  /api/tasks/admin/<pk>/   → update
    DELETE /api/tasks/admin/<pk>/   → delete
    """
    permission_classes = [IsAdmin]

    def get_object(self, pk, company):
        try:
            return Task.objects.select_related("assigned_to", "assigned_by").get(pk=pk, company=company)
        except Task.DoesNotExist:
            return None

    def get(self, request, pk):
        task = self.get_object(pk, request.company)
        if not task:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(TaskSerializer(task).data)

    def patch(self, request, pk):
        task = self.get_object(pk, request.company)
        if not task:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = TaskSerializer(task, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(TaskSerializer(task).data)

    def delete(self, request, pk):
        task = self.get_object(pk, request.company)
        if not task:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminTaskAttachmentCreateView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            task = Task.objects.get(pk=pk, company=request.company)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not files:
            return Response({"detail": "No files provided."}, status=status.HTTP_400_BAD_REQUEST)

        for f in files:
            TaskAttachment.objects.create(
                task=task,
                file=f,
                original_name=getattr(f, "name", "") or "",
                uploaded_by=request.user,
            )

        task = Task.objects.get(pk=pk)
        return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)


# ── Employee: own tasks ───────────────────────────────────────

class EmployeeTaskListView(GenericAPIView):
    """
    GET /api/tasks/my/              → list tasks assigned to current user
    """
    permission_classes = [IsAuthenticated]
    serializer_class = TaskSerializer

    def get(self, request):
        if not hasattr(request, 'company'):
            return Response([])
        qs = Task.objects.filter(assigned_to=request.user, company=request.company).select_related("assigned_by")
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
            
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
            
        return Response(TaskSerializer(qs, many=True).data)


class EmployeeTaskActionView(APIView):
    """
    POST/PATCH /api/tasks/my/<pk>/start/     → mark In Progress (records started_at)
    POST/PATCH /api/tasks/my/<pk>/complete/  → mark Completed   (records completed_at)
    PATCH      /api/tasks/my/<pk>/notes/     → update employee notes / status
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, MultiPartParser]

    def get_object(self, pk, user, company):
        try:
            return Task.objects.get(pk=pk, assigned_to=user, company=company)
        except Task.DoesNotExist:
            return None

    def post(self, request, pk, action):
        return self.handle_action(request, pk, action)

    def patch(self, request, pk, action):
        return self.handle_action(request, pk, action)

    def handle_action(self, request, pk, action):
        company = getattr(request, 'company', None)
        task = self.get_object(pk, request.user, company)
        if not task:
            return Response({"detail": "Not found or not assigned to you."}, status=status.HTTP_404_NOT_FOUND)

        if action == "start":
            if task.status == Task.Status.PENDING:
                from time_tracking.models import TimeLog
                lat = request.data.get("lat")
                lon = request.data.get("lon")
                photo = request.FILES.get("photo")

                employee_profile = getattr(request.user, "employee_profile", None)
                timelog = None
                if employee_profile:
                    timelog = TimeLog.objects.create(
                        employee=employee_profile,
                        work_date=timezone.localdate(),
                        clock_in=timezone.now(),
                        clock_in_lat=lat,
                        clock_in_lon=lon,
                        clock_in_photo=photo,
                    )
                
                task.status = Task.Status.IN_PROGRESS
                task.started_at = timezone.now()
                task.time_log = timelog
                task.save()

        elif action == "complete":
            if task.status in (Task.Status.PENDING, Task.Status.IN_PROGRESS):
                from time_tracking.models import TimeLogPhoto
                photo = request.FILES.get("photo")
                notes = request.data.get("notes", "")

                task.status = Task.Status.COMPLETED
                task.completed_at = timezone.now()
                if notes:
                    task.employee_notes = notes
                if not task.started_at:
                    task.started_at = task.completed_at
                
                if task.time_log:
                    task.time_log.clock_out = timezone.now()
                    task.time_log.clock_out_notes = notes
                    task.time_log.save()
                    if photo:
                        TimeLogPhoto.objects.create(
                            time_log=task.time_log,
                            photo=photo,
                            photo_type="after"
                        )
                task.save()

        elif action == "notes":
            ser = TaskStatusUpdateSerializer(task, data=request.data, partial=True)
            ser.is_valid(raise_exception=True)
            ser.save()
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=status.HTTP_400_BAD_REQUEST)

        return Response(TaskSerializer(task).data)
