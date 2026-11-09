"""Liveness/readiness probe used by the deploy pipeline and uptime monitors.

GET /api/v1/health/ answers 200 {"status": "ok"} only when the app booted AND
the database answers a trivial query. It carries no private data, needs no
login, and is exempt from throttling so a monitor can poll it freely.
"""

from django.db import connection
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception:  # never leak the error text; the status code is the signal
        response = Response({'status': 'error'}, status=503)
    else:
        response = Response({'status': 'ok'})
    response['Cache-Control'] = 'no-store'
    return response
