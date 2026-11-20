import re
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import alerts, checks, counters, recorder
from .models import WatchAlertLog, WatchCheck, WatchHourly, WatchIncident
from .sanitize import clean_text, normalise_route

FOUNDER_ROLES = ('CEO', 'CTO')
MAX_CLIENT_BODY = 8000


class IsFounder(permissions.BasePermission):
    """The CEO and CTO only: this screen shows how every school and every device is doing."""

    message = 'Security & System Watch is for the founders.'

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and getattr(u, 'role', '') in FOUNDER_ROLES)


def incident_json(i: WatchIncident, detail: bool = False) -> dict:
    data = {
        'id': str(i.id), 'category': i.category, 'category_label': dict(WatchIncident.CATEGORIES).get(i.category, i.category),
        'severity': i.severity, 'status': i.status, 'source': i.source, 'title': i.title, 'message': i.message, 'count': i.count,
        'affected_users': i.affected_users, 'affected_schools': len(i.affected_schools or []), 'school_name': i.school_name,
        'first_seen': i.first_seen.isoformat(), 'last_seen': i.last_seen.isoformat(), 'alert_count': i.alert_count,
        'acknowledged_by': i.acknowledged_by.name if i.acknowledged_by_id else '',
    }
    if detail:
        from .prompt import build_fix_prompt

        data.update({'fix_prompt': build_fix_prompt(i), 'details': i.details, 'schools': i.affected_schools, 'notes': i.notes, 'resolved_at': i.resolved_at.isoformat() if i.resolved_at else None,
                     'alerts': [{'kind': a.kind, 'sent_at': a.sent_at.isoformat(), 'delivered': a.delivered, 'to': len(a.recipients)} for a in i.alerts.all()[:10]]})
    return data


class OverviewView(APIView):
    permission_classes = [IsFounder]

    def get(self, request):
        counters.flush_hours()
        rows = WatchCheck.objects.exclude(key='monitor')
        open_qs = WatchIncident.objects.filter(status__in=('open', 'acknowledged'))
        by_sev = {r['severity']: r['n'] for r in open_qs.values('severity').annotate(n=Count('id'))}
        failing = [c for c in rows if c.status == 'fail']
        critical = by_sev.get('critical', 0)
        state = 'critical' if (critical or failing) else ('degraded' if by_sev.get('warning', 0) or any(c.status == 'warn' for c in rows) else 'healthy')
        since = timezone.now() - timedelta(hours=24)
        series = [{'hour': h.hour.isoformat(), 'requests': h.requests, 'errors_5xx': h.errors_5xx, 'errors_4xx': h.errors_4xx, 'slow': h.slow,
                   'client_errors': h.client_errors, 'login_failures': h.login_failures}
                  for h in WatchHourly.objects.filter(hour__gte=since).order_by('hour')]
        schools = {}
        for inc in open_qs.exclude(affected_schools=[]):
            for s in inc.affected_schools or []:
                row = schools.setdefault(s['id'], {'id': s['id'], 'name': s['name'], 'incidents': 0, 'events': 0})
                row['incidents'] += 1
                row['events'] += inc.count
        monitor = WatchCheck.objects.filter(key='monitor').first()
        return Response({
            'state': state, 'open': {'critical': by_sev.get('critical', 0), 'warning': by_sev.get('warning', 0), 'info': by_sev.get('info', 0)},
            'checks': [{'key': c.key, 'label': c.label, 'status': c.status, 'detail': c.detail, 'latency_ms': c.latency_ms,
                        'checked_at': c.checked_at.isoformat(), 'since': c.since.isoformat()} for c in rows],
            'monitor_last_run': monitor.checked_at.isoformat() if monitor else None,
            'series': series, 'schools': sorted(schools.values(), key=lambda r: -r['events'])[:10],
            'security_open': open_qs.filter(category='security').count(),
            'recipients': [{'name': p['name'], 'email': p['email'], 'role': p['role']} for p in alerts.recipients()],
            'last_alerts': [{'kind': a.kind, 'subject': a.subject, 'sent_at': a.sent_at.isoformat(), 'delivered': a.delivered, 'to': len(a.recipients)}
                            for a in WatchAlertLog.objects.all()[:8]],
        })


class IncidentListView(APIView):
    permission_classes = [IsFounder]

    def get(self, request):
        p = request.query_params
        qs = WatchIncident.objects.all()
        state = p.get('status') or 'active'
        if state == 'active':
            qs = qs.filter(status__in=('open', 'acknowledged'))
        elif state != 'all':
            qs = qs.filter(status=state)
        for key in ('severity', 'category', 'source'):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        if p.get('q'):
            qs = qs.filter(Q(title__icontains=p['q']) | Q(message__icontains=p['q']) | Q(school_name__icontains=p['q']))
        if p.get('school'):
            qs = qs.filter(affected_schools__contains=[{'id': p['school']}]) if False else qs.filter(school_id=p['school'])
        total = qs.count()
        page = max(int(p.get('page') or 1), 1)
        order = ('-severity', '-last_seen') if False else None
        items = sorted(qs.order_by('-last_seen')[:500], key=lambda i: (-WatchIncident.RANK[i.severity], -i.last_seen.timestamp()))
        start = (page - 1) * 30
        return Response({'count': total, 'page': page, 'results': [incident_json(i) for i in items[start:start + 30]]})


class IncidentDetailView(APIView):
    permission_classes = [IsFounder]

    def get(self, request, pk):
        return Response(incident_json(get_object_or_404(WatchIncident, pk=pk), detail=True))


class IncidentActionView(APIView):
    """Acknowledge ("someone is on it", which quiets repeat emails), resolve, ignore or reopen; every action can carry a note."""

    permission_classes = [IsFounder]

    def post(self, request, pk):
        incident = get_object_or_404(WatchIncident, pk=pk)
        action = str(request.data.get('action') or '')
        note = clean_text(request.data.get('note') or '', 500).strip()
        now = timezone.now()
        mapping = {'acknowledge': 'acknowledged', 'resolve': 'resolved', 'ignore': 'ignored', 'reopen': 'open'}
        if action not in mapping and not note:
            return Response({'detail': 'Choose an action or write a note.'}, status=400)
        if action in mapping:
            incident.status = mapping[action]
            incident.acknowledged_by = request.user if action == 'acknowledge' else incident.acknowledged_by
            incident.resolved_at = now if action == 'resolve' else None
        entry = {'at': now.isoformat(), 'by': request.user.name, 'text': note or {'acknowledge': 'Marked as being handled.', 'resolve': 'Marked as resolved.',
                                                                                  'ignore': 'Ignored.', 'reopen': 'Reopened.'}.get(action, '')}
        incident.notes = (incident.notes or []) + [entry]
        incident.save()
        return Response(incident_json(incident, detail=True))


class RunChecksView(APIView):
    permission_classes = [IsFounder]

    def post(self, request):
        checks.run_all()
        return OverviewView().get(request)


class TestAlertView(APIView):
    """Send a real test email to the CEO and CTO, so they know alerts reach them before something real happens."""

    permission_classes = [IsFounder]

    def post(self, request):
        people = alerts.recipients()
        if not people:
            return Response({'detail': 'No founder has an email address that can receive alerts. Add one on the Staff page.'}, status=400)
        incident, _ = WatchIncident.objects.get_or_create(
            fingerprint='watch:test', defaults={'category': 'health', 'severity': 'info', 'source': 'monitor', 'title': 'Test alert from System Watch',
                                                'message': 'Nothing is wrong. This checks that urgent alerts reach you.', 'last_seen': timezone.now(), 'status': 'resolved'})
        delivered = alerts.send_incident_email(str(incident.pk), 'test')
        return Response({'recipients': [p['email'] for p in people], 'delivered': delivered})


class AlertLogView(APIView):
    permission_classes = [IsFounder]

    def get(self, request):
        return Response([{'kind': a.kind, 'subject': a.subject, 'sent_at': a.sent_at.isoformat(), 'delivered': a.delivered, 'recipients': a.recipients}
                         for a in WatchAlertLog.objects.all()[:50]])


# ------------------------------------------------------------------ devices report their own errors

_NOISE = re.compile(r'ResizeObserver loop|chrome-extension://|moz-extension://|safari-extension://|Non-Error promise rejection|^Script error\.?$|AbortError|The user aborted|cancelled|NetworkError when attempting to fetch resource\.$', re.I)
_OS_ORDER = (r'(Android [\d.]+)', r'(iPhone OS [\d_]+)', r'(Windows NT [\d.]+)', r'(Mac OS X [\d_]+)', r'(Linux)')


def _device(ua: str) -> str:
    """"Chrome 120 on Android 13": the browser that really is (Chrome's UA also says Safari) and the system, nothing more."""
    ua = ua or ''
    name = 'Unknown browser'
    for token, label in (('Edg', 'Edge'), ('OPR', 'Opera'), ('SamsungBrowser', 'Samsung Browser'), ('Firefox', 'Firefox'), ('Chrome', 'Chrome'), ('Version', 'Safari')):
        m = re.search(rf'{token}/(\d+)', ua)
        if m:
            name = f'{label} {m.group(1)}'
            break
    system = next((m for m in (re.search(pattern, ua) for pattern in _OS_ORDER) if m), None)
    return f'{name} on {system.group(1).replace("_", ".")}' if system else name


class ClientErrorView(APIView):
    """Web, mobile and desktop apps report their own failures here, so a problem on one phone reaches the founders
    without anybody having to complain. Open to anyone (an app that cannot sign in still must be heard), throttled,
    strictly size-limited and scrubbed."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        if len(request.body or b'') > MAX_CLIENT_BODY:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        ip = (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', ''))
        key = f'watch:client:{ip}'
        try:
            cache.add(key, 0, 60)
            if cache.incr(key) > 40:
                return Response(status=status.HTTP_429_TOO_MANY_REQUESTS)
        except Exception:  # noqa: BLE001
            pass
        d = request.data if isinstance(request.data, dict) else {}
        app = str(d.get('app') or 'web')[:10]
        app = app if app in ('web', 'mobile', 'desktop') else 'web'
        kind = str(d.get('kind') or 'js_error')[:20]
        message = clean_text(d.get('message') or '', 300)
        if not message or _NOISE.search(message) or d.get('online') is False:
            return Response(status=status.HTTP_204_NO_CONTENT)      # offline devices and browser noise are not our problem
        user = self._user(request)
        route = normalise_route(d.get('route') or '')
        endpoint = normalise_route(d.get('endpoint') or '')
        stack = clean_text(d.get('stack') or '', 700)
        first_frame = re.sub(r'\?.*|:\d+:\d+', '', (stack.split('\n')[1] if '\n' in stack else '')).strip()[-90:]
        counters.bump('client_errors')
        if kind in ('network', 'api_timeout'):
            title = f'Devices cannot reach the server ({app}, {endpoint or "API"})'
            fp = recorder.fingerprint_of('net', app, endpoint)
            esc = (30, 15, 5, 3)
        else:
            title = f'{ {"js_error": "App error", "unhandled_rejection": "App error", "render_error": "Screen crashed", "chunk_load": "App failed to load", "api_5xx": "Server error seen by app"}.get(kind, "App error") } on {app}: {message[:90]}'
            fp = recorder.fingerprint_of('client', app, kind, re.sub(r'\d+', 'N', message)[:140], first_frame, route)
            esc = (25, 60, 5, 3)
        recorder.record(
            'client', title[:200], message=message, severity='warning', source=app, fingerprint=fp, user=user,
            details={'app': app, 'version': clean_text(d.get('version') or '', 30), 'route': route, 'kind': kind, 'endpoint': endpoint,
                     'status': d.get('status') if isinstance(d.get('status'), int) else None, 'device': _device(str(d.get('ua') or request.META.get('HTTP_USER_AGENT', ''))),
                     'stack': stack},
            escalate_after=esc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _user(request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header.lower().startswith('bearer '):
            return None
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication

            auth = JWTAuthentication()
            token = auth.get_validated_token(header.split(' ', 1)[1].strip().encode())
            return auth.get_user(token)
        except Exception:  # noqa: BLE001 - an expired token must not stop the report
            return None


class PingView(APIView):
    """For an outside uptime monitor (UptimeRobot, Better Stack): 200 while the system and its scheduler are alive,
    503 when the scheduler has stopped. Nothing private is in the answer."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        stale = checks.monitor_is_stale(minutes=15)
        response = Response({'status': 'degraded' if stale else 'ok', 'scheduler': 'stopped' if stale else 'running'}, status=503 if stale else 200)
        response['Cache-Control'] = 'no-store'
        return response
