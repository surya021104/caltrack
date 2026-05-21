"""
JWT + tenant auth middleware for Django Channels WebSocket connections.

Token resolution priority (most secure → least):
  1. qt_access httpOnly cookie  — browser sends it automatically, JS cannot read it
  2. ?token=<jwt> query param   — legacy / non-browser clients (Postman, mobile)

The resolved user and company objects are injected into the ASGI scope so
consumers can use them without re-authenticating.
"""
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.conf import settings


@database_sync_to_async
def _resolve_user_and_company(token_string: str):
    """
    Validate the JWT and return (user, company) or (None, None) on failure.
    Runs in a thread pool so synchronous ORM calls are safe.
    """
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import AccessToken, TokenError

    User = get_user_model()
    try:
        token = AccessToken(token_string)
        user_id = token.get("user_id")
        company_id = token.get("company_id")

        user = User.objects.get(id=user_id)
        company = None
        if company_id:
            from companies.models import Company
            company = Company.objects.filter(id=company_id).first()

        return user, company

    except (TokenError, User.DoesNotExist, Exception) as exc:
        print(f"[WS] JWT auth failed: {exc}")
        return None, None


def _extract_cookie_token(scope):
    """
    Parse the Cookie header from the WebSocket ASGI scope and return
    the value of the auth cookie (AUTH_COOKIE setting), or None.
    """
    cookie_name = getattr(settings, "AUTH_COOKIE", "qt_access")
    headers = dict(scope.get("headers", []))
    raw_cookie = headers.get(b"cookie", b"").decode("latin-1")
    if not raw_cookie:
        return None
    jar = SimpleCookie()
    jar.load(raw_cookie)
    morsel = jar.get(cookie_name)
    return morsel.value if morsel else None


class JWTTenantAuthMiddleware:
    """
    ASGI middleware that authenticates WebSocket connections via JWT.

    Checks the httpOnly cookie first (web browsers), then falls back to the
    ?token=<jwt> query param (API clients / mobile apps).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            # 1. Try cookie (preferred — JS-invisible)
            token_string = _extract_cookie_token(scope)

            # 2. Fall back to query param
            if not token_string:
                qs = scope.get("query_string", b"").decode()
                params = parse_qs(qs)
                token_list = params.get("token", [])
                token_string = token_list[0] if token_list else None

            if token_string:
                user, company = await _resolve_user_and_company(token_string)
            else:
                user, company = None, None

            scope["user"] = user
            scope["company"] = company

        return await self.app(scope, receive, send)
