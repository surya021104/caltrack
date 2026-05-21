"""
accounts/authentication.py

Custom DRF authentication backend that reads the JWT from an httpOnly cookie.
Falls back to the standard Authorization: Bearer <token> header so that
API clients (mobile apps, curl, Postman) still work unchanged.
"""
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    """
    Priority order:
      1. Authorization: Bearer <token>  header  (API clients, backward-compat)
      2. qt_access cookie               (web browser — httpOnly, JS-invisible)
    """

    def authenticate(self, request):
        # 1. Try the Authorization header first (standard simplejwt path)
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated = self.get_validated_token(raw_token)
                return self.get_user(validated), validated

        # 2. Fall back to the httpOnly cookie
        cookie_name = getattr(settings, "AUTH_COOKIE", "qt_access")
        raw_token = request.COOKIES.get(cookie_name)
        if not raw_token:
            return None

        try:
            validated = self.get_validated_token(raw_token)
            return self.get_user(validated), validated
        except Exception:
            # Expired / tampered cookie — return None so the view gets 401
            return None
