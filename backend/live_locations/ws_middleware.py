"""
JWT + tenant auth middleware for Django Channels WebSocket connections.

Extracts the Bearer token from ?token=<jwt> query param, validates it,
resolves the company from company_id claim, and injects user + company
into the ASGI scope so consumers can use them without re-authenticating.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async


@database_sync_to_async
def _resolve_user_and_company(token_string: str):
    """
    Run inside a thread pool so we can use synchronous Django ORM.
    Returns (user, company) or (None, None) on any failure.
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


class JWTTenantAuthMiddleware:
    """
    ASGI middleware that authenticates WebSocket connections via JWT.

    Usage: pass ?token=<access_token> as a query parameter on connect.
    The resolved user and company objects are available as:
      scope['user']    - Django User instance (or None)
      scope['company'] - Company instance (or None)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            qs = scope.get("query_string", b"").decode()
            params = parse_qs(qs)
            token_list = params.get("token", [])

            if token_list:
                user, company = await _resolve_user_and_company(token_list[0])
            else:
                user, company = None, None

            scope["user"] = user
            scope["company"] = company

        return await self.app(scope, receive, send)
