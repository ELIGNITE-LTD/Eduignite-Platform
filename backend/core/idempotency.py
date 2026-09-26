"""Answering a repeated request with the original answer.

The apps let a school record work with no connection: a payment taken, a
register marked, marks entered. Each piece of work is queued on the device
with a key, and sent when the network returns.

The dangerous case is not the request that fails. It is the request that
succeeds while the answer is lost on the way back. The device cannot tell the
difference between that and a request the server never received, so it sends
again, and without help the server would take the payment a second time.

Every replay carries the same key. The first arrival is processed normally and
its answer is kept; any later arrival of that key is answered from the stored
record without touching the database again. The client cannot tell the
difference, which is the point: recording a payment twice from one receipt is
impossible, however bad the connection was.
"""

import json
import logging

from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)

HEADER = 'HTTP_IDEMPOTENCY_KEY'
RECORDED_AT_HEADER = 'HTTP_X_OFFLINE_RECORDED_AT'
GUARDED_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
# Large answers are not worth storing: the record only has to prove the work
# was done and give the client back something usable.
MAX_STORED_BODY = 200_000


class IdempotencyMiddleware:
    """Makes a repeated write safe, for requests that ask for it.

    Only requests carrying an Idempotency-Key are affected, so nothing about
    the ordinary online path changes.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.META.get(HEADER, '').strip()
        if not key or request.method not in GUARDED_METHODS:
            return self.get_response(request)

        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return self.get_response(request)

        from apps.platform.models import IdempotencyRecord

        recorded_at = parse_datetime(request.META.get(RECORDED_AT_HEADER, '') or '')

        try:
            with transaction.atomic():
                record = IdempotencyRecord.objects.create(
                    key=key,
                    user=user,
                    method=request.method,
                    path=request.path[:500],
                    recorded_at=recorded_at,
                )
        except IntegrityError:
            # This key has been seen. Either the work is finished, and the
            # original answer is returned, or the first attempt is still
            # running and the client is asked to come back.
            return self._replay(key, user)

        response = self.get_response(request)
        self._remember(record, response)
        return response

    def _replay(self, key, user):
        from apps.platform.models import IdempotencyRecord

        record = IdempotencyRecord.objects.filter(key=key, user=user).first()

        if record is None or record.status != IdempotencyRecord.STATUS_COMPLETED:
            # Two copies of the same work arriving together: the second is told
            # to wait rather than being allowed to record it again.
            logger.info('Idempotent request %s is still in progress', key)
            return HttpResponse(
                json.dumps({'detail': 'This request is already being processed. Try again shortly.'}),
                status=409,
                content_type='application/json',
            )

        logger.info('Replaying stored answer for idempotent request %s', key)
        response = HttpResponse(
            record.response_body,
            status=record.response_status or 200,
            content_type='application/json',
        )
        # So a client, and anyone reading logs, can see this was a replay and
        # not a second record.
        response['Idempotent-Replay'] = 'true'
        return response

    def _remember(self, record, response):
        status_code = getattr(response, 'status_code', 500)

        # A request that failed is not remembered: the device should be able to
        # try it again properly rather than be handed the failure for ever.
        if status_code >= 400:
            record.delete()
            return

        body = ''
        content_type = response.get('Content-Type', '') if hasattr(response, 'get') else ''
        if 'application/json' in content_type:
            raw = getattr(response, 'content', b'') or b''
            if len(raw) <= MAX_STORED_BODY:
                body = raw.decode('utf-8', errors='replace')

        record.status = record.STATUS_COMPLETED
        record.response_status = status_code
        record.response_body = body
        record.updated_at = timezone.now()
        record.save(update_fields=['status', 'response_status', 'response_body', 'updated_at'])
