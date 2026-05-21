import uuid
import traceback

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from companies.models import Company

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
import requests

from .serializers import UserSerializer
from employees.utils import generate_next_employee_id


# ── Cookie helper ─────────────────────────────────────────────────────────────

def _set_auth_cookies(response, access_token, refresh_token=None):
    """
    Attach httpOnly JWT cookies to *response*.

    Access cookie  — sent to every path (needed for all API calls).
    Refresh cookie — restricted to /api/auth/refresh/ so it is never
                     accidentally exposed to other endpoints.
    """
    secure   = getattr(settings, "AUTH_COOKIE_SECURE", not settings.DEBUG)
    samesite = getattr(settings, "AUTH_COOKIE_SAMESITE", "Strict")

    access_max_age  = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    refresh_max_age = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())

    response.set_cookie(
        settings.AUTH_COOKIE,
        str(access_token),
        max_age=access_max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    if refresh_token is not None:
        response.set_cookie(
            settings.AUTH_COOKIE_REFRESH,
            str(refresh_token),
            max_age=refresh_max_age,
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/auth/refresh/",   # only sent to the refresh endpoint
        )
    return response


def _clear_auth_cookies(response):
    """Remove both auth cookies from the browser."""
    response.delete_cookie(settings.AUTH_COOKIE, path="/")
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path="/api/auth/refresh/")
    return response
import uuid
import traceback
from django.db import transaction
from companies.models import Company
from settings_hub.models import TeamInvite
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.core.mail import send_mail
from django.conf import settings




def _ensure_pretty_employee_id(employee, company):
    if not employee or not employee.employee_id:
        return
    raw = str(employee.employee_id).strip()
    if raw.upper().startswith("EMP-"):
        next_id = generate_next_employee_id(company)
        employee.employee_id = next_id
        employee.save(update_fields=["employee_id", "updated_at"])


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"] = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        username = attrs.get(self.username_field)
        email = attrs.get("email")
        if isinstance(username, str):
            username = username.strip()
            attrs[self.username_field] = username

        if (not username) and isinstance(email, str) and email.strip():
            User = get_user_model()
            user = User.objects.filter(email__iexact=email.strip()).first()
            if user:
                attrs[self.username_field] = user.username

        return super().validate(attrs)

    @classmethod
    def get_token(cls, user):
        # company is a shared model — no schema switch needed
        company = getattr(user, 'company', None)

        token = super().get_token(user)
        token["role"] = str(user.role)
        token["username"] = str(user.username)

        if company:
            token["company_id"] = str(company.id)

        return token


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            access  = response.data.get("access")
            refresh = response.data.get("refresh")
            _set_auth_cookies(response, access, refresh)
            # Strip tokens from the body — they live in httpOnly cookies now
            response.data = {"success": True, "message": "Login successful."}
        return response


class RefreshView(APIView):
    """
    Rotate the access token using the httpOnly refresh cookie.
    No body needed — the browser sends the cookie automatically.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not refresh_token:
            return Response(
                {"success": False, "message": "No refresh token — please log in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            from rest_framework_simplejwt.tokens import RefreshToken
            token = RefreshToken(refresh_token)
            access_token = token.access_token
            response = Response({"success": True})
            _set_auth_cookies(response, access_token)   # only rotate access cookie
            return response
        except Exception:
            response = Response(
                {"success": False, "message": "Session expired. Please log in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_auth_cookies(response)
            return response


class LogoutView(APIView):
    """Clear both auth cookies — works whether or not the user is authenticated."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        response = Response({"success": True, "message": "Logged out."})
        _clear_auth_cookies(response)
        return response


class GoogleLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        access_token = request.data.get("access_token")
        if not access_token:
            return Response({"detail": "Missing Google access token"}, status=status.HTTP_400_BAD_REQUEST)
        
        response = requests.get(f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={access_token}")
        if not response.ok:
            return Response({"detail": "Invalid Google access token"}, status=status.HTTP_400_BAD_REQUEST)
        
        user_info = response.json()
        email = user_info.get("email")
        if not email:
            return Response({"detail": "No email provided by Google"}, status=status.HTTP_400_BAD_REQUEST)
            
        User = get_user_model()
        user = User.objects.filter(email=email).first()
        
        # Check for pending invitations for this email
        from settings_hub.models import TeamInvite
        invite = TeamInvite.objects.filter(email__iexact=email, status="pending").first()

        if not user:
            username = email.split("@")[0]
            base_username = username
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}{counter}"
                counter += 1
            
            user = User.objects.create(
                username=username,
                email=email,
                first_name=user_info.get("given_name", ""),
                last_name=user_info.get("family_name", ""),
            )
            user.set_unusable_password()
            
            # If they have an invite, link them to the company immediately
            if invite:
                user.company = invite.company
                user.role = invite.role
                
            user.save()

        # If user exists but wasn't linked to a company, and now has an invite
        elif invite and not user.company:
            user.company = invite.company
            user.role = invite.role
            user.save(update_fields=["company", "role"])

        # Handle invitation acceptance logic
        if invite:
            with transaction.atomic():
                invite.status = "accepted"
                from django.utils import timezone
                invite.accepted_at = timezone.now()
                invite.save(update_fields=["status", "accepted_at"])

                # Ensure Employee profile exists in tenant schema
                if hasattr(connection, 'set_tenant'):
                    connection.set_tenant(invite.company)
                
                from employees.models import Employee
                Employee.objects.get_or_create(
                    user=user,
                    company=invite.company,
                    defaults={
                        "employee_id": generate_next_employee_id(invite.company),
                        "title": invite.role.title(),
                        "hourly_rate": 0,
                    }
                )
                if hasattr(connection, 'set_schema_to_public'):
                    connection.set_schema_to_public()

        refresh = CustomTokenObtainPairSerializer.get_token(user)
        response = Response({"success": True, "message": "Google login successful."})
        _set_auth_cookies(response, str(refresh.access_token), str(refresh))
        return response
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data
        })


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        print(f"DEBUG: RegisterView - POST request received: {request.data}")
        username = request.data.get("username")
        password = request.data.get("password")
        email = request.data.get("email", "")
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")
        organization_name = request.data.get("organization_name")

        username = (username or "").strip()
        email = (email or "").strip()
        first_name = (first_name or "").strip()
        last_name = (last_name or "").strip()
        organization_name = (organization_name or "").strip()

        if not username or not password or not organization_name:
            return Response({"detail": "Username, password, and Organization Name are required."}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        if User.objects.filter(username__iexact=username).exists():
            return Response({"detail": "Username is already taken."}, status=status.HTTP_400_BAD_REQUEST)

        from django.db import transaction

        try:
            # All shared-schema writes in one transaction (Company, Domain, User)
            with transaction.atomic():
                # 1. Create Company (triggers tenant schema creation + migrations)
                from django.utils.text import slugify
                existing_company = Company.objects.filter(company_name=organization_name).first()
                if existing_company and existing_company.users.count() == 0:
                    company = existing_company
                else:
                    company = Company.objects.create(
                        company_name=organization_name,
                        team_size=request.data.get("team_size"),
                        selected_modules=request.data.get("selected_modules", [])
                    )
                    from companies.models import Domain
                    Domain.objects.create(
                        domain=f"{company.schema_name}.localhost",
                        tenant=company,
                        is_primary=True
                    )

                # 2. Create User as Org Admin
                user = User.objects.create_user(
                    username=username,
                    password=password,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    role="admin",
                )
                user.company = company
                user.save()

            # 3. Create Employee in tenant schema (must be outside public transaction)
            if hasattr(connection, 'set_tenant'):
                connection.set_tenant(company)
                
            from employees.models import Employee
            Employee.objects.get_or_create(
                user=user,
                company=company,
                defaults={
                    "employee_id": generate_next_employee_id(company),
                    "title": "Admin",
                    "hourly_rate": 0,
                }
            )
            if hasattr(connection, 'set_schema_to_public'):
                connection.set_schema_to_public()

        except Exception as e:
            print(f"ERROR in RegisterView: {str(e)}")
            traceback.print_exc()
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        refresh = CustomTokenObtainPairSerializer.get_token(user)
        response = Response(
            {"success": True, "message": "Registration successful.", "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )
        _set_auth_cookies(response, str(refresh.access_token), str(refresh))
        return response


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)


class ProfileUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [__import__("rest_framework").parsers.MultiPartParser, __import__("rest_framework").parsers.FormParser, __import__("rest_framework").parsers.JSONParser]

    def patch(self, request):
        from .serializers import ProfileUpdateSerializer
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"success": True, "data": UserSerializer(request.user, context={"request": request}).data})
        return Response({"success": False, "message": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


class PasswordChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        current = request.data.get("current_password", "")
        new_pw = request.data.get("new_password", "")
        confirm = request.data.get("confirm_password", "")

        if not request.user.check_password(current):
            return Response({"success": False, "message": "Current password is incorrect."}, status=400)
        if len(new_pw) < 8:
            return Response({"success": False, "message": "Password must be at least 8 characters."}, status=400)
        if new_pw != confirm:
            return Response({"success": False, "message": "Passwords do not match."}, status=400)

        request.user.set_password(new_pw)
        request.user.save(update_fields=["password"])
        return Response({"success": True, "message": "Password updated successfully."})


class EmailChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        new_email = (request.data.get("new_email") or "").strip()
        password = request.data.get("password", "")

        if not new_email:
            return Response({"success": False, "message": "Email is required."}, status=400)
        if not request.user.check_password(password):
            return Response({"success": False, "message": "Password is incorrect."}, status=400)

        User = get_user_model()
        if User.objects.filter(email__iexact=new_email).exclude(pk=request.user.pk).exists():
            return Response({"success": False, "message": "That email is already in use."}, status=400)

        request.user.email = new_email
        request.user.save(update_fields=["email"])
        return Response({"success": True, "message": "Email updated."})


class TwoFactorSetupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            import pyotp, qrcode, io, base64
        except ImportError:
            return Response({"success": False, "message": "2FA library not installed."}, status=500)

        secret = pyotp.random_base32()
        request.user.totp_secret = secret
        request.user.save(update_fields=["totp_secret"])

        uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=request.user.email or request.user.username,
            issuer_name="QuickTIMS"
        )
        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        return Response({"success": True, "data": {"secret": secret, "qr_code": f"data:image/png;base64,{qr_b64}"}})

    def post(self, request):
        try:
            import pyotp
        except ImportError:
            return Response({"success": False, "message": "2FA library not installed."}, status=500)

        code = request.data.get("code", "")
        if not request.user.totp_secret:
            return Response({"success": False, "message": "No 2FA setup in progress."}, status=400)

        totp = pyotp.TOTP(request.user.totp_secret)
        if not totp.verify(code):
            return Response({"success": False, "message": "Invalid verification code."}, status=400)

        request.user.two_fa_enabled = True
        request.user.save(update_fields=["two_fa_enabled"])

        import secrets as _s
        backup_codes = [_s.token_hex(4).upper() for _ in range(8)]
        return Response({"success": True, "message": "2FA enabled.", "data": {"backup_codes": backup_codes}})

    def delete(self, request):
        password = request.data.get("password", "")
        if not request.user.check_password(password):
            return Response({"success": False, "message": "Incorrect password."}, status=400)
        request.user.two_fa_enabled = False
        request.user.totp_secret = ""
        request.user.save(update_fields=["two_fa_enabled", "totp_secret"])
        return Response({"success": True, "message": "2FA disabled."})


class AcceptInviteView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get("token")
        password = request.data.get("password")
        org_schema = request.data.get("org") # Get schema from URL/request
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")

        if not token or not password:
            return Response({"detail": "Token and password are required."}, status=status.HTTP_400_BAD_REQUEST)

        # Handle multi-tenant lookup
        if org_schema:
            if hasattr(connection, 'set_tenant'):
                from companies.models import Company
                company = Company.objects.filter(schema_name=org_schema).first()
                if company:
                    connection.set_tenant(company)
        
        invite = TeamInvite.objects.filter(token=token, status="pending").first()
        
        # Fallback: if not found in current schema, search all schemas
        if not invite:
            from django_tenants.utils import schema_context
            from companies.models import Company
            for company in Company.objects.all():
                with schema_context(company.schema_name):
                    invite = TeamInvite.objects.filter(token=token, status="pending").first()
                    if invite:
                        # Once found, set the tenant for the rest of the transaction
                        if hasattr(connection, 'set_tenant'):
                            connection.set_tenant(company)
                        break

        if not invite:
            return Response({"detail": "Invalid or expired invitation token."}, status=status.HTTP_400_BAD_REQUEST)
        
        if invite.is_expired:
            invite.status = "expired"
            invite.save(update_fields=["status"])
            return Response({"detail": "Invitation has expired."}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        if User.objects.filter(email__iexact=invite.email).exists():
            return Response({"detail": "User with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                username = invite.email.split("@")[0]
                base_username = username
                counter = 1
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}{counter}"
                    counter += 1

                user = User.objects.create_user(
                    username=username,
                    password=password,
                    email=invite.email,
                    first_name=first_name,
                    last_name=last_name,
                    role=invite.role,
                )
                user.company = invite.company
                user.save()

                invite.status = "accepted"
                from django.utils import timezone
                invite.accepted_at = timezone.now()
                invite.save(update_fields=["status", "accepted_at"])

            if hasattr(connection, 'set_tenant'):
                connection.set_tenant(invite.company)

            from employees.models import Employee
            Employee.objects.get_or_create(
                user=user,
                company=invite.company,
                defaults={
                    "employee_id": generate_next_employee_id(invite.company),
                    "title": invite.role.title(),
                    "hourly_rate": 0,
                }
            )

            if hasattr(connection, 'set_schema_to_public'):
                connection.set_schema_to_public()

        except Exception as e:
            traceback.print_exc()
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        refresh = CustomTokenObtainPairSerializer.get_token(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
            "message": "Login successfully"
        }, status=status.HTTP_201_CREATED)

class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email")
        if not email:
            return Response({"detail": "Email is required"}, status=400)
            
        User = get_user_model()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            token_generator = PasswordResetTokenGenerator()
            token = token_generator.make_token(user)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            
            # Fallback frontend URL if not defined
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
            reset_url = f"{frontend_url}/reset-password?uid={uid}&token={token}"
            
            try:
                send_mail(
                    "Password Reset Request",
                    f"Click the link below to reset your password:\n\n{reset_url}\n\nIf you did not request this, please ignore this email.",
                    "noreply@caltrack.com",
                    [email],
                    fail_silently=True,
                )
            except Exception as e:
                print(f"Failed to send email: {e}")
        
        # Always return success to prevent email enumeration
        return Response({"detail": "If an account exists with that email, a password reset link has been sent."})

class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uidb64 = request.data.get("uid")
        token = request.data.get("token")
        new_password = request.data.get("new_password")
        
        if not uidb64 or not token or not new_password:
            return Response({"detail": "Missing required fields"}, status=400)
            
        User = get_user_model()
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None
            
        if user is not None and PasswordResetTokenGenerator().check_token(user, token):
            user.set_password(new_password)
            user.save()
            return Response({"detail": "Password has been reset successfully."})
        return Response({"detail": "Invalid or expired token"}, status=400)
