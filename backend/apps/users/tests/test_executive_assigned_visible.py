"""An executive must SEE what the founders assigned.

Root cause covered here: the web/mobile/desktop apps read the signed-in user
from ``/auth/me/`` (``build_user_payload``), which did not carry
``allowed_modules``, so every non-founder executive looked like one with no
modules: an empty menu and an Overview saying nothing was assigned. Also: the
assignment email, and the frontend/backend catalogue staying in step.
"""

import re
from pathlib import Path
from unittest import mock

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.orders.models import EmailNotificationLog
from apps.users.executive_access import ASSIGNABLE_EXECUTIVE_ROLES, executive_may_open_route
from apps.users.executive_modules import EXECUTIVE_MODULE_KEYS, EXECUTIVE_MODULES, MODULE_INFO
from apps.users.models import FounderProfile, User
from apps.users.tests.test_executive_module_access import API, _make_user

pytestmark = pytest.mark.django_db

REPO = Path(__file__).resolve().parents[4]
PASSWORD = 'password123'


@pytest.fixture(autouse=True)
def _clean():
    cache.clear()
    yield
    cache.clear()


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _payload(**extra):
    base = {
        'name': 'Ada Operations', 'email': 'ada.ops@mail.eduignite.online', 'phone': '670000001',
        'role': 'COO', 'founder_title': 'Head of Operations',
    }
    base.update(extra)
    return base


def _login(user):
    response = APIClient().post(API + 'auth/login/', {'matricule': user.matricule, 'password': PASSWORD}, format='json')
    assert response.status_code == 200, response.data
    return response.data


# ---------------------------------------------------------------------------
# Modules are saved and travel in every payload the app reads
# ---------------------------------------------------------------------------

def test_created_executive_keeps_modules_and_every_payload_returns_them():
    ceo = _make_user('CEO')
    modules = ['support', 'schools', 'announcements', 'platform_billing']
    created = _client(ceo).post(API + 'users/founders/', _payload(allowed_modules=modules, customer_care_access=True), format='json')
    assert created.status_code == 201, created.data
    expected = [*modules, 'customer_care']
    assert created.data['allowed_modules'] == expected
    user = User.objects.get(email='ada.ops@mail.eduignite.online')
    assert user.allowed_modules == expected

    user.set_password(PASSWORD)
    user.save(update_fields=['password'])
    login = _login(user)
    assert login['user']['allowed_modules'] == expected
    assert login['user']['is_founder'] is False
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f'Bearer {login["access_token"]}')
    assert bearer.get(API + 'auth/me/').data['allowed_modules'] == expected
    assert bearer.get(API + 'users/me/').data['allowed_modules'] == expected


def test_founders_payload_flags_them_as_founders_and_unknown_keys_are_dropped():
    ceo = _make_user('CEO')
    ceo.allowed_modules = ['support', 'not_a_module']
    ceo.save(update_fields=['allowed_modules'])
    data = _client(ceo).get(API + 'auth/me/').data
    assert data['is_founder'] is True
    assert data['allowed_modules'] == ['support']


def test_non_executives_get_an_empty_list():
    assert _client(_make_user('TEACHER')).get(API + 'auth/me/').data['allowed_modules'] == []


@pytest.mark.parametrize('role', sorted(ASSIGNABLE_EXECUTIVE_ROLES))
def test_overview_is_never_blocked_even_with_no_modules(role):
    user = _make_user(role)
    for path in ('/dashboard', '/dashboard/', '/dashboard?x=1'):
        assert executive_may_open_route(user, path)


# ---------------------------------------------------------------------------
# Catalogue equality, backend == every frontend app
# ---------------------------------------------------------------------------

def _ts(app):
    return (REPO / 'apps' / app / 'src' / 'lib' / 'executive-modules.ts').read_text(encoding='utf-8')


@pytest.mark.parametrize('app', ['website', 'mobile', 'desktop'])
def test_every_catalogue_key_label_and_description_matches_the_frontend(app):
    entries = re.findall(r'\{ key: "([a-z_]+)", label: "([^"]+)", description: "((?:[^"\\]|\\.)*)"', _ts(app))
    frontend = {key: (label, description.replace('\\"', '"')) for key, label, description in entries}
    assert set(frontend) == EXECUTIVE_MODULE_KEYS
    assert set(MODULE_INFO) == EXECUTIVE_MODULE_KEYS
    assert {k: v for k, v in MODULE_INFO.items()} == frontend


# ---------------------------------------------------------------------------
# Assignment emails
# ---------------------------------------------------------------------------

@pytest.fixture
def outbox():
    sent = []

    def fake(**kwargs):
        sent.append(kwargs)
        return True

    with mock.patch('core.email_service.send_transactional_email', side_effect=fake):
        yield sent


def _activity_mails(outbox):
    return [m for m in outbox if 'activities' in m['subject']]


def test_creating_with_modules_emails_the_executive_without_a_password(outbox, django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    ceo.name = 'Chief <b>Boss</b>'
    ceo.save(update_fields=['name'])
    with django_capture_on_commit_callbacks(execute=True):
        response = _client(ceo).post(
            API + 'users/founders/',
            _payload(name='Ada <script>x</script>', allowed_modules=['support', 'feedback']),
            format='json',
        )
    assert response.status_code == 201
    mails = _activity_mails(outbox)
    assert len(mails) == 1
    mail = mails[0]
    assert mail['to_email'] == 'ada.ops@mail.eduignite.online'
    assert mail['subject'] == 'Your EduIgnite activities have been assigned'
    html = mail['html']
    assert 'Support registry' in html and 'Feedback' in html
    assert 'Operational Department' in html
    assert '<script>' not in html and '&lt;script&gt;' in html  # escaped
    assert 'Chief &lt;b&gt;Boss' in html  # who made the change, escaped
    assert 'Aper' in html and 'Retire' not in html  # French line present; nothing removed
    assert 'password' not in html.lower().replace('forgot password', '')


def test_creating_without_modules_sends_no_activities_email(outbox, django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    with django_capture_on_commit_callbacks(execute=True):
        _client(ceo).post(API + 'users/founders/', _payload(), format='json')
    assert _activity_mails(outbox) == []


def _created(ceo, outbox, capture, **extra):
    with capture(execute=True):
        response = _client(ceo).post(API + 'users/founders/', _payload(**extra), format='json')
    assert response.status_code == 201, response.data
    outbox.clear()
    return FounderProfile.objects.get(user__email='ada.ops@mail.eduignite.online')


def test_changing_modules_emails_what_was_added_and_removed(outbox, django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    profile = _created(ceo, outbox, django_capture_on_commit_callbacks, allowed_modules=['support', 'feedback'])
    with django_capture_on_commit_callbacks(execute=True):
        response = _client(ceo).patch(
            API + f'users/founders/{profile.id}/', {'allowed_modules': ['support', 'surveys']}, format='json',
        )
    assert response.status_code == 200
    (mail,) = _activity_mails(outbox)
    assert mail['subject'] == 'Your EduIgnite activities have been updated'
    html = mail['html']
    assert 'Added' in html and 'Surveys' in html
    assert 'Removed' in html and 'Feedback' in html
    assert EmailNotificationLog.objects.filter(key__startswith='exec-activities:').count() == 2  # creation + this change


def test_removing_everything_is_reported(outbox, django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    profile = _created(ceo, outbox, django_capture_on_commit_callbacks, allowed_modules=['support'])
    with django_capture_on_commit_callbacks(execute=True):
        _client(ceo).patch(API + f'users/founders/{profile.id}/', {'allowed_modules': []}, format='json')
    (mail,) = _activity_mails(outbox)
    assert 'Removed' in mail['html'] and 'no activity assigned' in mail['html']


def test_no_change_sends_nothing(outbox, django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    profile = _created(ceo, outbox, django_capture_on_commit_callbacks, allowed_modules=['support'])
    with django_capture_on_commit_callbacks(execute=True):
        _client(ceo).patch(API + f'users/founders/{profile.id}/', {'allowed_modules': ['support'], 'phone': '670000009'}, format='json')
        _client(ceo).patch(API + f'users/founders/{profile.id}/', {'founder_title': 'Head'}, format='json')
    assert _activity_mails(outbox) == []


def test_role_change_is_reported_with_the_new_department(outbox, django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    profile = _created(ceo, outbox, django_capture_on_commit_callbacks, allowed_modules=['support'])
    with django_capture_on_commit_callbacks(execute=True):
        _client(ceo).patch(API + f'users/founders/{profile.id}/', {'role': 'DESIGNER'}, format='json')
    (mail,) = _activity_mails(outbox)
    assert 'Marketing Department' in mail['html'] and 'Operational Department' in mail['html']


def test_same_change_twice_in_a_row_is_one_email(outbox):
    from apps.orders.api import notify_executive_activities_changed

    ceo = _make_user('CEO')
    exec_user = _make_user('COO', ['support'])
    exec_user.email = 'twice@mail.eduignite.online'
    exec_user.save(update_fields=['email'])
    assert notify_executive_activities_changed(exec_user, ceo, [], ['support']) is True
    assert notify_executive_activities_changed(exec_user, ceo, [], ['support']) is False
    assert len(_activity_mails(outbox)) == 1


def test_a_failing_provider_never_breaks_the_edit(django_capture_on_commit_callbacks):
    ceo = _make_user('CEO')
    with mock.patch('core.email_service.send_transactional_email', side_effect=RuntimeError('boom')):
        with django_capture_on_commit_callbacks(execute=True):
            response = _client(ceo).post(API + 'users/founders/', _payload(allowed_modules=['support']), format='json')
    assert response.status_code == 201
    assert User.objects.get(email='ada.ops@mail.eduignite.online').allowed_modules == ['support']
