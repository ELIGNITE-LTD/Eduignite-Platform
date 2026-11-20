import time

from django.core.cache import cache

from . import counters, sensors

SLOW_SECONDS = 6.0
EXEMPT = ('/api/health', '/api/v1/watch/', '/static/', '/media/')


class WatchMiddleware:
    """Counts traffic, notices slow requests and unhandled errors, and checks the scheduler is alive. Cheap by design:
    one cache increment per request, and nothing here may ever fail a request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        try:
            path = request.path
            if path.startswith('/api/') and not path.startswith(EXEMPT):
                counters.bump('requests')
                status = response.status_code
                if status >= 500:
                    counters.bump('errors_5xx')
                elif status >= 400:
                    counters.bump('errors_4xx')
                elapsed = time.monotonic() - started
                if elapsed >= SLOW_SECONDS:
                    counters.bump('slow')
                    sensors.slow_request(request, elapsed)
            self._scheduler_check()
        except Exception:  # noqa: BLE001
            pass
        return response

    def process_exception(self, request, exception):
        sensors.server_error(request, exception)
        return None

    @staticmethod
    def _scheduler_check():
        """Every couple of minutes, from any web process: have the scheduled checks stopped? That means the worker or the
        scheduler is down, which the worker itself can never report."""
        try:
            if not cache.add('watch:stale-check', 1, 120):
                return
            from . import checks, recorder

            if checks.monitor_is_stale():
                recorder.record('health', 'The background scheduler has stopped', severity='critical', source='monitor',
                                message='The scheduled health checks have not run for over 10 minutes, so the worker or the scheduler is down. '
                                        'Emails, reminders and AI jobs will not run until it is back.',
                                fingerprint='monitor:stale', details={'check': 'Scheduler'})
            else:
                recorder.resolve('monitor:stale', note='The scheduled checks are running again.')
        except Exception:  # noqa: BLE001
            pass
