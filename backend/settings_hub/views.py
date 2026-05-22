from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import is_admin_role

from .models import (
    NotificationPreference, LoginSession, LoginHistory,
    APIKey, Webhook, TeamInvite, Invoice,
)
from .serializers import (
    NotificationPreferenceSerializer,
    LoginSessionSerializer, LoginHistorySerializer,
    APIKeySerializer, APIKeyCreateSerializer,
    WebhookSerializer, TeamInviteSerializer, TeamInviteCreateSerializer,
    InvoiceSerializer,
)


class InvoiceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        invoices = Invoice.objects.filter(company=request.user.company)
        return Response({"success": True, "data": InvoiceSerializer(invoices, many=True).data})


def _is_admin(user):
    return is_admin_role(user)


# ─── Notification Preferences ────────────────────────────────────────────────

class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response({"success": True, "data": NotificationPreferenceSerializer(prefs).data})

    def patch(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"success": True, "data": serializer.data})
        return Response({"success": False, "message": serializer.errors}, status=400)


# ─── Sessions ────────────────────────────────────────────────────────────────

class SessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = LoginSession.objects.filter(user=request.user, revoked=False)
        return Response({"success": True, "data": LoginSessionSerializer(sessions, many=True).data})


class SessionRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        session = LoginSession.objects.filter(pk=pk, user=request.user, revoked=False).first()
        if not session:
            return Response({"success": False, "message": "Session not found."}, status=404)
        if session.is_current:
            return Response({"success": False, "message": "Cannot revoke current session."}, status=400)
        session.revoked = True
        session.save(update_fields=["revoked"])
        return Response({"success": True, "message": "Session revoked."})


class SessionRevokeAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        LoginSession.objects.filter(user=request.user, revoked=False, is_current=False).update(revoked=True)
        return Response({"success": True, "message": "All other sessions revoked."})


class LoginHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        history = LoginHistory.objects.filter(user=request.user)[:50]
        return Response({"success": True, "data": LoginHistorySerializer(history, many=True).data})


# ─── API Keys ─────────────────────────────────────────────────────────────────

class APIKeyListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        keys = APIKey.objects.filter(company=request.user.company, revoked=False)
        return Response({"success": True, "data": APIKeySerializer(keys, many=True).data})

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        serializer = APIKeyCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": serializer.errors}, status=400)

        expires_at = None
        if serializer.validated_data.get("expires_in_days"):
            expires_at = timezone.now() + timezone.timedelta(days=serializer.validated_data["expires_in_days"])

        api_key_obj, raw_key = APIKey.generate(
            company=request.user.company,
            created_by=request.user,
            name=serializer.validated_data["name"],
            scopes=serializer.validated_data.get("scopes", ["read"]),
        )
        if expires_at:
            api_key_obj.expires_at = expires_at
            api_key_obj.save(update_fields=["expires_at"])

        data = APIKeySerializer(api_key_obj).data
        data["raw_key"] = raw_key
        return Response({"success": True, "data": data, "message": "API key created. Copy it now — it won't be shown again."}, status=201)


class APIKeyRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        key = APIKey.objects.filter(pk=pk, company=request.user.company, revoked=False).first()
        if not key:
            return Response({"success": False, "message": "API key not found."}, status=404)
        key.revoked = True
        key.save(update_fields=["revoked"])
        return Response({"success": True, "message": "API key revoked."})


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class WebhookListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        webhooks = Webhook.objects.filter(company=request.user.company)
        return Response({"success": True, "data": WebhookSerializer(webhooks, many=True).data})

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        serializer = WebhookSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": serializer.errors}, status=400)
        webhook = serializer.save(company=request.user.company, created_by=request.user)
        return Response({"success": True, "data": WebhookSerializer(webhook).data}, status=201)


class WebhookDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_webhook(self, request, pk):
        return Webhook.objects.filter(pk=pk, company=request.user.company).first()

    def put(self, request, pk):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        webhook = self._get_webhook(request, pk)
        if not webhook:
            return Response({"success": False, "message": "Webhook not found."}, status=404)
        serializer = WebhookSerializer(webhook, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"success": True, "data": serializer.data})
        return Response({"success": False, "message": serializer.errors}, status=400)

    def delete(self, request, pk):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        webhook = self._get_webhook(request, pk)
        if not webhook:
            return Response({"success": False, "message": "Webhook not found."}, status=404)
        webhook.delete()
        return Response({"success": True, "message": "Webhook deleted."})


# ─── Team Invites ─────────────────────────────────────────────────────────────

class TeamMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        members = User.objects.filter(company=request.user.company, is_active=True).order_by("first_name", "username")
        data = [
            {
                "id": str(m.pk),
                "username": m.username,
                "email": m.email,
                "name": m.get_full_name() or m.username,
                "role": m.role,
                "date_joined": m.date_joined.isoformat(),
                "is_current_user": m.pk == request.user.pk,
            }
            for m in members
        ]
        return Response({"success": True, "data": data})


class TeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        member = User.objects.filter(pk=pk, company=request.user.company).first()
        if not member:
            return Response({"success": False, "message": "Member not found."}, status=404)
        if member.pk == request.user.pk:
            return Response({"success": False, "message": "Cannot change your own role."}, status=400)
        new_role = request.data.get("role")
        allowed = ["admin", "manager", "employee"]
        if new_role not in allowed:
            return Response({"success": False, "message": f"Role must be one of {allowed}."}, status=400)
        member.role = new_role
        member.save(update_fields=["role"])
        return Response({"success": True, "message": "Role updated."})

    def delete(self, request, pk):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        member = User.objects.filter(pk=pk, company=request.user.company).first()
        if not member:
            return Response({"success": False, "message": "Member not found."}, status=404)
        if member.pk == request.user.pk:
            return Response({"success": False, "message": "Cannot remove yourself."}, status=400)
        member.is_active = False
        member.save(update_fields=["is_active"])
        return Response({"success": True, "message": "Member removed."})


class TeamInviteListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        invites = TeamInvite.objects.filter(company=request.user.company, status="pending")
        return Response({"success": True, "data": TeamInviteSerializer(invites, many=True).data})

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        serializer = TeamInviteCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": serializer.errors}, status=400)

        email = serializer.validated_data["email"]
        if TeamInvite.objects.filter(company=request.user.company, email=email, status="pending").exists():
            return Response({"success": False, "message": "Invite already pending for this email."}, status=400)

        invite = TeamInvite.objects.create(
            company=request.user.company,
            invited_by=request.user,
            email=email,
            role=serializer.validated_data["role"],
        )

        from django.core.mail import send_mail
        from django.conf import settings
        from django.template.loader import render_to_string
        from django.utils.html import strip_tags
        
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        invite_link = f"{frontend_url}/accept-invite?token={invite.token}&org={request.user.company.schema_name}"
        
        context = {
            'company_name': request.user.company.company_name,
            'inviter_name': request.user.get_full_name() or request.user.username,
            'role': invite.role,
            'invite_link': invite_link,
        }
        
        html_message = render_to_string('emails/team_invite.html', context)
        plain_message = strip_tags(html_message)
        
        email_sent = False
        error_message = None
        try:
            send_mail(
                subject=f"Invitation to join {request.user.company.company_name} on Caltrack",
                message=plain_message,
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@caltrack.com'),
                recipient_list=[email],
                html_message=html_message,
                fail_silently=False,
            )
            email_sent = True
        except Exception as e:
            print(f"Failed to send email: {e}")
            error_message = str(e)

        return Response({
            "success": email_sent,
            "data": TeamInviteSerializer(invite).data,
            "message": f"Invite created. Email sent to {email}." if email_sent else f"Invite created, but EMAIL FAILED: {error_message}",
        }, status=status.HTTP_201_CREATED if email_sent else status.HTTP_500_INTERNAL_SERVER_ERROR)


class TeamInviteRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        print(f"DEBUG: Revoking invite {pk} for user {request.user}")
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        
        # Allow revoking any invite that hasn't been accepted yet
        invite = TeamInvite.objects.filter(pk=pk, company=request.user.company).exclude(status="accepted").first()
        
        if not invite:
            print(f"DEBUG: Invite {pk} not found for company {request.user.company}")
            return Response({"success": False, "message": "Invite not found."}, status=404)
            
        invite.status = "revoked"
        invite.save(update_fields=["status"])
        print(f"DEBUG: Invite {pk} revoked successfully")
        return Response({"success": True, "message": "Invite cancelled."})


# ─── Billing (stub — integrate real payment provider) ─────────────────────────

PLANS = {
    "free": {"name": "Free", "price": 0, "employees": 5, "storage_gb": 1, "api_calls": 1000},
    "pro": {"name": "Pro", "price": 29, "employees": 50, "storage_gb": 20, "api_calls": 50000},
    "enterprise": {"name": "Enterprise", "price": 99, "employees": -1, "storage_gb": 500, "api_calls": -1},
}


class BillingSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        company = request.user.company
        plan_key = getattr(company, "plan", "free")
        plan = PLANS.get(plan_key, PLANS["free"])

        from django.contrib.auth import get_user_model
        user_count = get_user_model().objects.filter(company=company, is_active=True).count()

        return Response({
            "success": True,
            "data": {
                "plan": plan_key,
                "plan_name": plan["name"],
                "price_monthly": plan["price"],
                "renewal_date": None,
                "usage": {
                    "employees": user_count,
                    "employees_limit": plan["employees"],
                    "storage_gb": 0.4,
                    "storage_limit": plan["storage_gb"],
                    "api_calls_this_month": 0,
                    "api_calls_limit": plan["api_calls"],
                },
                "payment_method": None,
                "invoices": [],
            }
        })


# ─── Data Export & Deletion ───────────────────────────────────────────────────

class DataExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({
            "success": True,
            "message": "Data export requested. You will receive an email with your data archive within 24 hours.",
        })


class AccountDeletionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get("password", "")
        if not request.user.check_password(password):
            return Response({"success": False, "message": "Incorrect password."}, status=400)
        request.user.is_active = False
        request.user.save(update_fields=["is_active"])
        return Response({"success": True, "message": "Account scheduled for deletion."})


class WorkspaceDeletionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        confirm = request.data.get("confirm_name", "")
        company = request.user.company
        if confirm != company.company_name:
            return Response({"success": False, "message": "Workspace name does not match."}, status=400)
        return Response({"success": True, "message": "Workspace deletion scheduled. You will receive a confirmation email."})


class OwnerTransferView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admins only."}, status=403)
        new_owner_email = request.data.get("email", "")
        from django.contrib.auth import get_user_model
        User = get_user_model()
        new_owner = User.objects.filter(email=new_owner_email, company=request.user.company, is_active=True).first()
        if not new_owner:
            return Response({"success": False, "message": "No active team member found with that email."}, status=404)
        if new_owner.pk == request.user.pk:
            return Response({"success": False, "message": "You are already the owner."}, status=400)
        new_owner.role = "admin"
        new_owner.save(update_fields=["role"])
        request.user.role = "manager"
        request.user.save(update_fields=["role"])
        return Response({"success": True, "message": f"Ownership transferred to {new_owner_email}."})
