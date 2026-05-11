import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

# Imports must come AFTER django.setup()
from live_locations.routing import websocket_urlpatterns
from live_locations.ws_middleware import JWTTenantAuthMiddleware

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTTenantAuthMiddleware(
        URLRouter(websocket_urlpatterns)
    ),
})
