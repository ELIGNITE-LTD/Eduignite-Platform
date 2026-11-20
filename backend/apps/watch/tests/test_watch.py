"""Security & System Watch: problems are grouped, escalated, and the CEO and CTO are emailed about urgent ones."""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.watch import alerts, checks, recorder, security, sensors
from apps.watch.models import WatchAlertLog, WatchCheck, WatchIncident

User = get_user_model()
BASE = '/api/v1/watch/'


def person(matricule, role, email=None, **extra):
    return User.objects.create_user(matricule=matricule, name=f'{role} {matricule}', email=email or f'{matricule.lower()}@eduignite.org', role=role,
                                    password='password123', **extra)


class WatchBase(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo, self.cto = person('CEO-W1', 'CEO'), person('CTO-W1', 'CTO')
        self.teacher = person('TCH-W1', 'TEACHER')
        self.sent = []
        patcher = patch('core.email_service.send_transactional_email', side_effect=lambda **kw: self.sent.append(kw) or True)
        patcher.start()
        self.addCleanup(patcher.stop)
        eager = override_settings(CELERY_TASK_ALWAYS_EAGER=True)
        eager.enable()
        self.addCleanup(eager.disable)

    def to(self):
        return sorted(m['to_email'] for m in self.sent)

    def boom(self):
        try:
            raise ValueError('database exploded for token eyJabcdefgh.ijklmnopqr.stuvwxyz12')
        except ValueError as exc:
            return exc


class RecorderTests(WatchBase):
    def test_repeats_are_one_incident_with_a_count_people_and_schools(self):
        u1, u2 = person('TCH-W2', 'TEACHER'), person('TCH-W3', 'TEACHER')
        for u in (u1, u2, u1):
            recorder.record('client', 'Screen crashed', severity='warning', fingerprint='fp-1', user=u)
        incident = WatchIncident.objects.get()
        self.assertEqual((incident.count, incident.affected_users), (3, 2))
        self.assertEqual(self.sent, [])     # a warning never emails

    def test_secrets_and_personal_data_are_scrubbed_before_anything_is_stored(self):
        exc = self.boom()
        recorder.record('server', 'x', message=str(exc), fingerprint='fp-2', details={'password': 'hunter2', 'note': 'mail me at ada.nkeng@gmail.com', 'authorization': 'Bearer abc'})
        i = WatchIncident.objects.get()
        self.assertNotIn('eyJabc', i.message)
        self.assertEqual(i.details['password'], '[removed]')
        self.assertEqual(i.details['authorization'], '[removed]')
        self.assertNotIn('ada.nkeng@', i.details['note'])

    def test_a_recording_failure_never_reaches_the_caller(self):
        with patch('apps.watch.recorder._record', side_effect=RuntimeError('db down')):
            self.assertIsNone(recorder.record('server', 'x'))

    def test_a_solved_problem_that_returns_reopens_the_same_incident(self):
        recorder.record('server', 'Bug', fingerprint='fp-3')
        WatchIncident.objects.update(status='resolved', resolved_at=timezone.now())
        recorder.record('server', 'Bug', fingerprint='fp-3')
        incident = WatchIncident.objects.get()
        self.assertEqual((incident.status, incident.count), ('open', 2))
        self.assertTrue(any('again' in n['text'] for n in incident.notes))

    def test_ignored_problems_keep_counting_quietly(self):
        recorder.record('server', 'Noise', fingerprint='fp-4', severity='critical')
        WatchIncident.objects.update(status='ignored')
        self.sent.clear()
        recorder.record('server', 'Noise', fingerprint='fp-4', severity='critical')
        self.assertEqual((WatchIncident.objects.get().count, self.sent), (2, []))


class AlertTests(WatchBase):
    def test_a_critical_problem_emails_both_the_ceo_and_the_cto_at_once(self):
        recorder.record('health', 'Database is failing', severity='critical', message='no answer', fingerprint='fp-5')
        self.assertEqual(self.to(), sorted([self.ceo.email, self.cto.email]))
        self.assertIn('CRITICAL', self.sent[0]['subject'])
        log = WatchAlertLog.objects.get()
        self.assertEqual((log.kind, log.delivered), ('critical', 2))

    def test_the_same_problem_is_not_emailed_again_until_it_gets_much_worse(self):
        recorder.record('health', 'Cache down', severity='critical', fingerprint='fp-6')
        self.sent.clear()
        for _ in range(3):
            recorder.record('health', 'Cache down', severity='critical', fingerprint='fp-6')
        self.assertEqual(self.sent, [])                                   # inside the cooldown, not much worse
        WatchIncident.objects.update(count=40)
        recorder.record('health', 'Cache down', severity='critical', fingerprint='fp-6')
        self.assertEqual(len(self.sent), 2)                               # 5x worse: both founders told again

    def test_acknowledging_quiets_repeat_emails(self):
        recorder.record('health', 'Cache down', severity='critical', fingerprint='fp-7')
        WatchIncident.objects.update(status='acknowledged')
        self.sent.clear()
        recorder.record('health', 'Cache down', severity='critical', fingerprint='fp-7')
        self.assertEqual(self.sent, [])

    def test_a_warning_that_escalates_becomes_an_alert(self):
        for _ in range(4):
            recorder.record('server', 'Bug', fingerprint='fp-8', escalate_after=(5, 60, 0, 0))
        self.assertEqual(self.sent, [])
        recorder.record('server', 'Bug', fingerprint='fp-8', escalate_after=(5, 60, 0, 0))
        self.assertEqual(len(self.sent), 2)
        self.assertEqual(WatchIncident.objects.get().severity, 'critical')

    def test_the_hourly_cap_stops_an_alert_storm(self):
        for n in range(alerts.MAX_ALERTS_PER_HOUR + 5):
            recorder.record('health', f'Different problem {n}', severity='critical', fingerprint=f'storm-{n}')
        self.assertEqual(len(self.sent), alerts.MAX_ALERTS_PER_HOUR * 2)

    def test_only_deliverable_founder_addresses_are_used(self):
        User.objects.filter(pk=self.cto.pk).update(email='cto@example.com')     # a placeholder address that cannot receive mail
        self.assertEqual([p['email'] for p in alerts.recipients()], [self.ceo.email])

    @override_settings(WATCH_ALERT_EXTRA_EMAILS=['oncall@eduignite.org'])
    def test_an_extra_on_call_address_can_be_added(self):
        self.assertIn('oncall@eduignite.org', [p['email'] for p in alerts.recipients()])

    def test_a_morning_digest_lists_open_warnings(self):
        recorder.record('client', 'Screen crashed', fingerprint='fp-9')
        self.sent.clear()
        alerts.send_digest()
        self.assertEqual(len(self.sent), 2)
        self.assertIn('open problem', self.sent[0]['subject'])


class HealthCheckTests(WatchBase):
    def test_a_failing_check_raises_a_critical_incident_and_recovery_closes_it_and_says_so(self):
        only_cache = [c for c in checks.CHECKS if c[0] == 'cache']      # the others depend on this machine (disk space...)
        with patch.object(checks, 'CHECKS', only_cache):
            with patch.object(checks, '_cache', return_value=(checks.FAIL, 'Redis did not answer.', None)):
                checks.run_all()
            incident = WatchIncident.objects.get(fingerprint='check:cache')
            self.assertEqual((incident.severity, incident.status), ('critical', 'open'))
            self.assertEqual(len(self.sent), 2)
            self.assertEqual(WatchCheck.objects.get(key='cache').status, 'fail')
            self.sent.clear()
            checks.run_all()
        incident.refresh_from_db()
        self.assertEqual(incident.status, 'resolved')
        self.assertEqual(len(self.sent), 2)
        self.assertIn('RECOVERED', self.sent[0]['subject'])

    def test_a_check_that_cannot_run_is_itself_reported(self):
        with patch.object(checks, '_disk', side_effect=OSError('no disk')):
            checks.run_all()
        self.assertEqual(WatchCheck.objects.get(key='disk').status, 'fail')

    def test_a_stopped_scheduler_is_detected_from_the_web_side(self):
        checks.run_all()
        WatchCheck.objects.filter(key='monitor').update(checked_at=timezone.now() - timedelta(minutes=30))
        self.assertTrue(checks.monitor_is_stale())
        self.assertEqual(APIClient().get(BASE + 'ping/').status_code, 503)
        checks.run_all()
        self.assertEqual(APIClient().get(BASE + 'ping/').status_code, 200)


class SecurityTests(WatchBase):
    def req(self, ip='10.0.0.1'):
        class R:
            META = {'REMOTE_ADDR': ip}
        return R()

    def test_password_guessing_on_one_account_is_a_warning(self):
        for _ in range(security.ACCOUNT_WARN):
            security.login_failed(self.req(), 'TCH-W1', 'wrong password')
        i = WatchIncident.objects.get(category='security')
        self.assertEqual(i.severity, 'warning')
        self.assertNotIn('TCH-W1', i.message)          # the account is masked

    def test_credential_stuffing_from_one_address_is_critical_and_emails_the_founders(self):
        for n in range(security.IP_ACCOUNTS_CRITICAL):
            security.login_failed(self.req('203.0.113.9'), f'ACC-{n}', 'unknown matricule')
        i = WatchIncident.objects.get(category='security')
        self.assertEqual(i.severity, 'critical')
        self.assertEqual(len(self.sent), 2)
        self.assertNotIn('203.0.113.9', i.message)      # only the start of the address is kept

    def test_a_sign_in_that_works_after_many_failures_on_a_privileged_account_is_critical(self):
        for _ in range(6):
            security.login_failed(self.req(), self.ceo.matricule, 'wrong password')
        security.login_succeeded(self.req(), self.ceo)
        self.assertTrue(WatchIncident.objects.filter(title__startswith='Sign-in succeeded', severity='critical').exists())

    def test_the_real_login_view_feeds_the_sensor(self):
        client = APIClient()
        for _ in range(security.ACCOUNT_WARN):
            client.post('/api/v1/auth/login/', {'matricule': self.teacher.matricule, 'password': 'nope'}, format='json')
        self.assertTrue(WatchIncident.objects.filter(category='security', severity='warning').exists())


class ServerErrorTests(WatchBase):
    class FakeRequest:
        method, path, user = 'POST', '/api/v1/students/students/', None

    def test_the_same_bug_is_one_incident_and_it_grows(self):
        for _ in range(3):
            sensors.server_error(self.FakeRequest(), self.boom())
        incident = WatchIncident.objects.get(category='server')
        self.assertEqual((incident.count, incident.severity), (3, 'warning'))
        self.assertIn('ValueError', incident.title)

    def test_a_failure_on_login_or_payments_is_urgent_straight_away(self):
        class Pay(self.FakeRequest):
            path = '/api/v1/fees/fapshi/webhook/'
        sensors.server_error(Pay(), self.boom())
        self.assertEqual(WatchIncident.objects.get().severity, 'critical')
        self.assertEqual(len(self.sent), 2)

    def test_an_unhandled_exception_in_a_real_view_is_recorded(self):
        with patch('apps.authentication.views.User.objects.get', side_effect=RuntimeError('kaboom')):
            client = APIClient(raise_request_exception=False)
            r = client.post('/api/v1/auth/login/', {'matricule': self.teacher.matricule, 'password': 'password123'}, format='json')
        self.assertEqual(r.status_code, 500)
        self.assertTrue(WatchIncident.objects.filter(category='server', severity='critical').exists())   # login is urgent


class ClientErrorTests(WatchBase):
    def post(self, **body):
        data = {'app': 'web', 'kind': 'js_error', 'message': 'Cannot read properties of undefined (reading "name")', 'route': '/dashboard/students/12', 'version': '1.0', 'online': True}
        data.update(body)
        return APIClient().post(BASE + 'client-errors/', data, format='json')

    def test_a_device_report_becomes_an_incident_without_any_login(self):
        self.assertEqual(self.post().status_code, 204)
        i = WatchIncident.objects.get(category='client')
        self.assertEqual((i.source, i.severity), ('web', 'warning'))
        self.assertEqual(i.details['route'], '/dashboard/students/:n')

    def test_noise_and_offline_devices_are_ignored(self):
        self.post(message='ResizeObserver loop limit exceeded')
        self.post(online=False)
        self.post(message='chrome-extension://abc failed')
        self.assertEqual(WatchIncident.objects.count(), 0)

    def test_a_broken_release_reaching_many_people_becomes_critical_and_emails(self):
        for n in range(6):
            user = person(f'TCH-C{n}', 'TEACHER')
            client = APIClient()
            client.force_authenticate(user)
            from rest_framework_simplejwt.tokens import RefreshToken
            token = str(RefreshToken.for_user(user).access_token)
            APIClient().post(BASE + 'client-errors/', {'app': 'mobile', 'kind': 'render_error', 'message': 'Screen crashed', 'route': '/dashboard/grades'},
                             format='json', HTTP_AUTHORIZATION=f'Bearer {token}')
        i = WatchIncident.objects.get(category='client')
        self.assertEqual((i.affected_users, i.severity), (6, 'critical'))
        self.assertEqual(len(self.sent), 2)

    def test_a_flood_from_one_address_is_throttled_and_oversized_reports_refused(self):
        codes = [self.post(message=f'error {n}').status_code for n in range(45)]
        self.assertIn(429, codes)
        self.assertEqual(APIClient().post(BASE + 'client-errors/', {'app': 'web', 'message': 'x' * 9000}, format='json').status_code, 413)


class FounderApiTests(WatchBase):
    def login(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_only_the_ceo_and_cto_can_see_the_watch(self):
        for url in ('overview/', 'incidents/', 'alerts/'):
            self.assertEqual(self.login(self.teacher).get(BASE + url).status_code, 403, url)
            self.assertEqual(APIClient().get(BASE + url).status_code, 401, url)
            self.assertEqual(self.login(self.ceo).get(BASE + url).status_code, 200, url)
            self.assertEqual(self.login(self.cto).get(BASE + url).status_code, 200, url)

    def test_overview_summarises_health_incidents_traffic_and_recipients(self):
        checks.run_all()
        recorder.record('health', 'Database is failing', severity='critical', fingerprint='fp-o')
        data = self.login(self.ceo).get(BASE + 'overview/').data
        self.assertEqual(data['state'], 'critical')
        self.assertGreaterEqual(data['open']['critical'], 1)
        self.assertTrue(data['checks'])
        self.assertEqual(sorted(r['role'] for r in data['recipients']), ['CEO', 'CTO'])

    def test_acknowledge_resolve_ignore_and_notes(self):
        recorder.record('server', 'Bug', severity='warning', fingerprint='fp-a')
        incident = WatchIncident.objects.get()
        c = self.login(self.cto)
        url = f'{BASE}incidents/{incident.id}/action/'
        r = c.post(url, {'action': 'acknowledge'}, format='json').data
        self.assertEqual((r['status'], r['acknowledged_by']), ('acknowledged', self.cto.name))
        self.assertEqual(c.post(url, {'note': 'Rolled back the deploy.'}, format='json').data['notes'][-1]['text'], 'Rolled back the deploy.')
        self.assertEqual(c.post(url, {'action': 'resolve'}, format='json').data['status'], 'resolved')
        self.assertEqual(c.post(url, {}, format='json').status_code, 400)
        active = c.get(BASE + 'incidents/').data['count']
        self.assertEqual(active, 0)
        self.assertEqual(c.get(BASE + 'incidents/?status=resolved').data['count'], 1)

    def test_incidents_filter_by_severity_category_and_search_and_sort_worst_first(self):
        recorder.record('server', 'Small thing', severity='warning', fingerprint='f1')
        recorder.record('security', 'Attack on logins', severity='critical', fingerprint='f2')
        c = self.login(self.ceo)
        titles = [i['title'] for i in c.get(BASE + 'incidents/').data['results']]
        self.assertEqual(titles[0], 'Attack on logins')
        self.assertEqual(c.get(BASE + 'incidents/?category=server').data['count'], 1)
        self.assertEqual(c.get(BASE + 'incidents/?q=attack').data['count'], 1)

    def test_the_test_alert_reaches_both_founders(self):
        r = self.login(self.ceo).post(BASE + 'test-alert/', {}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.to(), sorted([self.ceo.email, self.cto.email]))
        self.assertIn('TEST', self.sent[0]['subject'])

    def test_run_checks_now(self):
        self.assertEqual(self.login(self.ceo).post(BASE + 'run-checks/', {}, format='json').status_code, 200)
        self.assertTrue(WatchCheck.objects.filter(key='database').exists())


class TrafficTests(WatchBase):
    def test_requests_and_errors_are_counted_per_hour(self):
        from apps.watch import counters
        client = APIClient()
        client.post('/api/v1/auth/login/', {'matricule': 'nobody', 'password': 'x'}, format='json')
        self.assertGreaterEqual(counters.read('requests'), 1)
        self.assertGreaterEqual(counters.read('errors_4xx'), 1)
        counters.flush_hours()
        from apps.watch.models import WatchHourly
        self.assertTrue(WatchHourly.objects.exists())

    def test_email_provider_failures_raise_an_incident(self):
        from core.email_service import EmailEvent, _watch_email_failed
        for _ in range(5):
            _watch_email_failed(EmailEvent.PASSWORD_RESET, 'The email provider answered 401.')
        self.assertTrue(WatchIncident.objects.filter(category='email').exists())
        before = WatchIncident.objects.count()
        _watch_email_failed(EmailEvent.SYSTEM_ALERT, 'ignored')      # alert emails never feed the alarm
        self.assertEqual(WatchIncident.objects.count(), before)
