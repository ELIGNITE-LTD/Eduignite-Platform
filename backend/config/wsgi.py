import logging
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')

application = get_wsgi_application()

# Import every URLconf (all apps' views, serializers, permissions) while the
# worker boots, not on its first request. Loading them takes several seconds,
# so after every deploy the first request each worker served (often a login)
# waited that long and could hit the browser's 30 s timeout on a busy server.
# gunicorn only routes traffic to a worker once this module has been imported.
try:
    from django.urls import get_resolver

    get_resolver().url_patterns
except Exception:  # noqa: BLE001 - never stop the worker from booting
    logging.getLogger(__name__).exception('URL conf warm-up failed')
