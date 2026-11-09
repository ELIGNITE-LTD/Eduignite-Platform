"""System log: capture, privacy, founders-only API, immutability, resilience."""

import itertools
from unittest import mock

import pytest
from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.platform.executive_activity import module_for_path
from apps.platform.models import ExecutiveActivityLog
from apps.schools.models import School
from apps.users.models import User

pytestmark = pytest.mark.django_db

API = '/api/v1/'
LOG = API + 'platform/executive-activity/'
_n = itertools.count(1)


def make_user(role, modules=None, school=None, password='password123'):
    n = next(_n)
    return User.objects.create_user(
        matricule=f'EDULOG{n:05d}', name=f'{role.title()} Person {n}', email=f'log{role.lower()}{n}@example.com',
        role=role, password=password, school=school, allowed_modules=list(modules or []),
    )


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def school():
    return School.objects.create(
        id='LOG-SCH-1', name='Log School', short_name='LS', principal='P', location='Douala',
        email='ls@example.com', phone='237650100201', school_type='general', subsystem='bilingual',
    )


def test_write_by_executive_is_logged_with_success(school):
    designer = make_user('DESIGNER', ['portfolio_policy'])
    r = client_for(designer).patch(API + 'platform/settings/', {'contact_phone': '237650000000'}, format='json')
    assert r.status_code == 200, r.content
    row = ExecutiveActivityLog.objects.get(actor=designer)
    assert row.outcome == 'success' and row.method == 'PATCH' and row.status_code == 200
    assert row.module == 'portfolio_policy' and row.action == 'update'
    assert row.actor_role == 'DESIGNER' and row.actor_name == designer.name
    assert 'Marketing Department' in row.summary
    assert row.created_at is not None and row.request_id


def test_denied_write_is_logged_as_denied():
    designer = make_user('DESIGNER', [])  # no module assigned
    r = client_for(designer).patch(API + 'platform/settings/', {'contact_phone': '1'}, format='json')
    assert r.status_code == 403
    row = ExecutiveActivityLog.objects.get(actor=designer)
    assert row.outcome == 'denied' and row.status_code == 403
    assert 'denied' in row.summary


def test_get_is_not_logged_but_export_is():
    coo = make_user('COO', ['portfolio_policy'])
    c = client_for(coo)
    c.get(API + 'platform/settings/')
    c.get(API + 'platform/fees/')
    assert ExecutiveActivityLog.objects.count() == 0
    # A sensitive read (secrets) is recorded, even when denied.
    c.get(API + 'platform/integration-secrets/')
    row = ExecutiveActivityLog.objects.get(actor=coo)
    assert row.action == 'view_sensitive' and row.module == 'integrations'


def test_non_executives_are_not_logged(school):
    admin = make_user('SCHOOL_ADMIN', school=school)
    client_for(admin).post(API + 'platform/fees/', {}, format='json')
    client_for(admin).patch(API + 'platform/settings/', {'contact_phone': '1'}, format='json')
    assert ExecutiveActivityLog.objects.count() == 0


def test_no_secrets_or_bodies_stored():
    designer = make_user('DESIGNER', ['portfolio_policy'])
    client_for(designer).patch(
        API + 'platform/settings/', {'contact_phone': '237650000999', 'password': 'S3cretPassw0rd!', 'token': 'tok-abc-123'},
        format='json',
    )
    blob = ' '.join(
        str(v) for row in ExecutiveActivityLog.objects.values() for v in row.values()
    )
    assert 'S3cretPassw0rd' not in blob and 'tok-abc-123' not in blob and '237650000999' not in blob


def test_logout_and_password_change_logged_login_failed_and_success():
    user = make_user('SYSTEM_DEV', password='Right-pass-1')
    anon = APIClient()
    r = anon.post(API + 'auth/login/', {'matricule': user.matricule, 'password': 'wrong'}, format='json')
    assert r.status_code == 401
    r = anon.post(API + 'auth/login/', {'matricule': user.matricule, 'password': 'Right-pass-1'}, format='json')
    assert r.status_code == 200, r.content
    actions = list(ExecutiveActivityLog.objects.filter(actor=user).order_by('created_at').values_list('action', 'outcome'))
    assert ('login_failed', 'failed') in actions and ('login', 'success') in actions
    # School users' logins are not part of the executive log.
    pupil_admin = make_user('SCHOOL_ADMIN', password='Right-pass-1')
    anon.post(API + 'auth/login/', {'matricule': pupil_admin.matricule, 'password': 'wrong'}, format='json')
    assert not ExecutiveActivityLog.objects.filter(actor=pupil_admin).exists()

    c = client_for(user)
    c.post(API + 'auth/change-password/', {'old_password': 'Right-pass-1', 'new_password': 'Brand-new-9x', 'confirm_password': 'Brand-new-9x'}, format='json')
    c.post(API + 'auth/logout/', {'refresh': 'bogus'}, format='json')
    got = set(ExecutiveActivityLog.objects.filter(actor=user).values_list('action', flat=True))
    assert {'password_change', 'logout'} <= got
    assert 'Brand-new-9x' not in ' '.join(str(v) for r in ExecutiveActivityLog.objects.values() for v in r.values())


def test_founder_module_assignment_is_logged_with_keys_only():
    ceo = make_user('CEO')
    target = make_user('COO')
    from apps.users.models import FounderProfile
    fp = FounderProfile.objects.create(user=target, founder_title='Ops')
    r = client_for(ceo).patch(API + f'users/founders/{fp.pk}/', {'allowed_modules': ['schools', 'support']}, format='json')
    assert r.status_code == 200, r.content
    row = ExecutiveActivityLog.objects.get(actor=ceo)
    assert row.action == 'config_change' and row.module == 'founders' and row.actor_role == 'CEO'
    assert 'schools, support' in row.summary


def test_founders_read_filter_export_and_equal_access(school):
    ceo, cto = make_user('CEO'), make_user('CTO')
    designer = make_user('DESIGNER', [])
    client_for(designer).patch(API + 'platform/settings/', {'contact_phone': '1'}, format='json')
    coo = make_user('COO', ['portfolio_policy'])
    client_for(coo).patch(API + 'platform/settings/', {'contact_phone': '2'}, format='json')

    for founder in (ceo, cto):
        c = client_for(founder)
        data = c.get(LOG, {'module': 'portfolio_policy'}).json()
        assert data['count'] == 2 and data['timezone'] == 'Africa/Douala'
        assert data['results'][0]['actor_department'] in ('Operational Department', 'Marketing Department')
        assert c.get(LOG, {'status': 'denied'}).json()['count'] == 1
        assert c.get(LOG, {'executive': str(coo.pk)}).json()['count'] == 1
        assert c.get(LOG, {'module': 'portfolio_policy', 'action': 'update'}).json()['count'] == 2
        assert c.get(LOG, {'q': designer.name}).json()['count'] == 1
        assert c.get(LOG, {'from': '2999-01-01'}).json()['count'] == 0
        assert c.get(LOG, {'to': '2000-01-01'}).json()['count'] == 0
        assert c.get(LOG, {'ordering': 'actor', 'page_size': 1}).json()['has_next'] is True
        s = c.get(LOG + 'summary/').json()
        assert s['today'] >= 2 and s['denied_last_7_days'] == 1 and s['most_active_executive']
        assert {designer.name, coo.name} <= {e['name'] for e in s['per_executive']}
        r = c.get(LOG + 'export/')
        assert r.status_code == 200 and r['Content-Type'].startswith('text/csv')
        body = r.content.decode('utf-8')
        assert 'Marketing Department' in body and 'Operational Department' in body
    # Founders' own export is logged as an action (one per founder).
    assert ExecutiveActivityLog.objects.filter(action='export', module='executive_activity').count() == 2
    # Plain reads by founders are not logged.
    assert ExecutiveActivityLog.objects.filter(actor=ceo).count() == 1


@pytest.mark.parametrize('role', ['DESIGNER', 'COO', 'SYSTEM_DEV', 'INV', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'])
def test_log_is_closed_to_everyone_but_ceo_cto(role):
    # Even holding every module, nobody else can read the log, not even their own entries.
    from apps.users.executive_modules import EXECUTIVE_MODULE_KEYS
    user = make_user(role, sorted(EXECUTIVE_MODULE_KEYS))
    c = client_for(user)
    for url in (LOG, LOG + 'summary/', LOG + 'export/'):
        assert c.get(url).status_code == 403
    assert APIClient().get(LOG).status_code in (401, 403)


def test_log_is_read_only_through_the_api():
    ceo = make_user('CEO')
    c = client_for(ceo)
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(c, method)(LOG, {}, format='json').status_code == 405


def test_immutability():
    row = ExecutiveActivityLog.objects.create(action='update', actor_name='x')
    row.summary = 'changed'
    with pytest.raises(PermissionError):
        row.save()
    with pytest.raises(PermissionError):
        row.delete()
    with pytest.raises(PermissionError):
        ExecutiveActivityLog.objects.all().update(summary='z')
    with pytest.raises(PermissionError):
        ExecutiveActivityLog.objects.all().delete()
    from apps.platform.admin import ExecutiveActivityLogAdmin
    from django.contrib import admin as dj_admin
    ma = ExecutiveActivityLogAdmin(ExecutiveActivityLog, dj_admin.site)
    assert not ma.has_add_permission(None) and not ma.has_change_permission(None) and not ma.has_delete_permission(None)


def test_logging_failure_does_not_break_request():
    designer = make_user('DESIGNER', ['portfolio_policy'])
    with mock.patch('apps.platform.executive_activity.ExecutiveActivityLog.objects') as objs:
        objs.create.side_effect = RuntimeError('db down')
        r = client_for(designer).patch(API + 'platform/settings/', {'contact_phone': '3'}, format='json')
    assert r.status_code == 200
    with mock.patch('apps.platform.executive_activity.ExecutiveActivityMiddleware._record', side_effect=RuntimeError('boom')):
        r = client_for(designer).patch(API + 'platform/settings/', {'contact_phone': '4'}, format='json')
    assert r.status_code == 200


def test_logging_adds_one_insert_only():
    designer = make_user('DESIGNER', ['portfolio_policy'])
    c = client_for(designer)
    with CaptureQueriesContext(connection) as with_log:
        c.patch(API + 'platform/settings/', {'contact_phone': '5'}, format='json')
    inserts = [q for q in with_log.captured_queries if 'platform_executiveactivitylog' in q['sql'] and q['sql'].startswith('INSERT')]
    assert len(inserts) == 1
    extra = [q for q in with_log.captured_queries if 'platform_executiveactivitylog' in q['sql'] and not q['sql'].startswith(('INSERT', 'SAVEPOINT', 'RELEASE'))]
    assert extra == []


def test_prune_command_dry_run_by_default():
    from datetime import timedelta
    from django.utils import timezone
    old = ExecutiveActivityLog.objects.create(action='update', actor_name='old', created_at=timezone.now() - timedelta(days=900))
    ExecutiveActivityLog.objects.create(action='update', actor_name='new')
    call_command('prune_executive_activity', '--older-than-days', '365')
    assert ExecutiveActivityLog.objects.count() == 2
    call_command('prune_executive_activity', '--older-than-days', '365', '--apply')
    assert list(ExecutiveActivityLog.objects.values_list('actor_name', flat=True)) == ['new']
    assert not ExecutiveActivityLog.objects.filter(pk=old.pk).exists()


def test_module_registry_matches_catalogue():
    from apps.users.executive_modules import EXECUTIVE_MODULE_KEYS
    assert module_for_path('/api/v1/schools/abc/') == 'schools'
    assert module_for_path('/api/v1/platform/events/1/') == 'portfolio_policy'
    assert module_for_path('/api/v1/registry/apps/') == 'app_registry'
    assert module_for_path('/api/v1/unknown/') == 'general'
    from apps.platform.executive_activity import MODULE_PREFIXES
    known = EXECUTIVE_MODULE_KEYS | {'founders', 'accounts', 'authentication', 'integrations', 'executive_activity'}
    assert {m for _, m in MODULE_PREFIXES} <= known
