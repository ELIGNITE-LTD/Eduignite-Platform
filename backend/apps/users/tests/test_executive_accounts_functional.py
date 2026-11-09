"""Regression tests: every executive account can sign in and do its assigned work.

Production report: executive staff accounts could not carry out the activities
the founders assigned. These tests cover what the older suite did not:

* a REAL login (``/auth/login/``) and bearer-token requests, not only
  ``force_authenticate``, for every executive role;
* token refresh, and the ``sessions_valid_after`` cutoff (null / older / newer);
* the same module endpoint matrix for EVERY assignable role (the older suite
  only ran COO and SUPER_ADMIN);
* ``/registry/my-apps/`` gives executives every app route (nothing to hide);
* the ``check_executive_accounts`` repair command (dry run by default).
"""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.executive_access import ASSIGNABLE_EXECUTIVE_ROLES, user_has_module
from apps.users.executive_modules import EXECUTIVE_MODULE_KEYS
from apps.users.models import User
from apps.users.tests.test_executive_module_access import (  # noqa: F401  (world is a fixture)
    API,
    MATRIX,
    _assert_authorised,
    _call,
    _make_user,
    world,
)

pytestmark = pytest.mark.django_db

@pytest.fixture(autouse=True)
def _reset_throttles():
    """Login/refresh are rate limited per IP; every test starts with a clean slate."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


PASSWORD = 'password123'
ALL_EXECUTIVE_ROLES = ['CEO', 'CTO', *sorted(ASSIGNABLE_EXECUTIVE_ROLES)]


def _login(user):
    client = APIClient()
    response = client.post(
        API + 'auth/login/', {'matricule': user.matricule, 'password': PASSWORD}, format='json',
    )
    assert response.status_code == 200, response.data
    return response.data


def _bearer(access):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
    return client


# ---------------------------------------------------------------------------
# Real login, /auth/me, /users/me, token refresh
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('role', ALL_EXECUTIVE_ROLES)
def test_executive_can_log_in_and_read_own_profile(role):
    user = _make_user(role, ['schools', 'support'])
    data = _login(user)
    assert data['user']['role'] == role
    assert data['user']['is_platform_executive'] is True
    assert data['user']['must_change_password'] is False

    client = _bearer(data['access_token'])
    me = client.get(API + 'auth/me/')
    assert me.status_code == 200 and me.data['role'] == role
    detail = client.get(API + 'users/me/')
    assert detail.status_code == 200
    assert detail.data['allowed_modules'] == ['schools', 'support']
    assert detail.data['display_role']


@pytest.mark.parametrize('role', ALL_EXECUTIVE_ROLES)
def test_executive_refresh_token_yields_a_working_access_token(role):
    user = _make_user(role)
    data = _login(user)
    refreshed = APIClient().post(API + 'auth/refresh/', {'refresh': data['refresh_token']}, format='json')
    assert refreshed.status_code == 200
    assert _bearer(refreshed.data['access']).get(API + 'auth/me/').status_code == 200


@pytest.mark.parametrize('role', ALL_EXECUTIVE_ROLES)
def test_executive_with_no_school_is_not_blocked_by_school_checks(role):
    user = _make_user(role)
    assert user.school_id is None
    assert _login(user)['user']['school'] is None


# ---------------------------------------------------------------------------
# sessions_valid_after: null / older / newer
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('role', ALL_EXECUTIVE_ROLES)
def test_null_cutoff_never_rejects(role):
    user = _make_user(role)
    assert user.sessions_valid_after is None
    data = _login(user)
    assert _bearer(data['access_token']).get(API + 'auth/me/').status_code == 200


@pytest.mark.parametrize('role', ALL_EXECUTIVE_ROLES)
def test_older_cutoff_keeps_new_sessions_working(role):
    user = _make_user(role)
    user.sessions_valid_after = timezone.now() - timedelta(hours=1)
    user.save(update_fields=['sessions_valid_after'])
    data = _login(user)
    client = _bearer(data['access_token'])
    assert client.get(API + 'auth/me/').status_code == 200
    refreshed = APIClient().post(API + 'auth/refresh/', {'refresh': data['refresh_token']}, format='json')
    assert refreshed.status_code == 200


@pytest.mark.parametrize('role', ALL_EXECUTIVE_ROLES)
def test_newer_cutoff_ends_old_sessions_and_a_fresh_login_works_again(role):
    user = _make_user(role)
    old = _login(user)
    user.sessions_valid_after = timezone.now() + timedelta(minutes=5)
    user.save(update_fields=['sessions_valid_after'])
    assert _bearer(old['access_token']).get(API + 'auth/me/').status_code == 401
    refreshed = APIClient().post(API + 'auth/refresh/', {'refresh': old['refresh_token']}, format='json')
    assert refreshed.status_code == 401
    # The repair command clears the cutoff; the executive can then sign in again.
    call_command('check_executive_accounts', '--apply', '--matricule', user.matricule, stdout=StringIO())
    user.refresh_from_db()
    assert user.sessions_valid_after is None
    assert _bearer(_login(user)['access_token']).get(API + 'auth/me/').status_code == 200


# ---------------------------------------------------------------------------
# Every assignable role x every module endpoint, with a REAL bearer token
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('module,method,path,payload,fmt', MATRIX)
@pytest.mark.parametrize('role', ['INV', 'DESIGNER', 'SYSTEM_DEV'])
def test_remaining_roles_with_module_are_authorised(world, module, method, path, payload, fmt, role):
    """COO and SUPER_ADMIN are covered by the older suite; these are the other three."""
    user = _make_user(role, [module])
    client = _bearer(_login(user)['access_token'])
    response = _call(client, method, path(world), payload, fmt)
    _assert_authorised(response, f'{role} with {module} (real JWT)')


@pytest.mark.parametrize('module,method,path,payload,fmt', MATRIX[:6] + MATRIX[40:44])
@pytest.mark.parametrize('role', ['COO', 'SUPER_ADMIN'])
def test_real_jwt_matches_force_authenticate(world, module, method, path, payload, fmt, role):
    user = _make_user(role, [module])
    client = _bearer(_login(user)['access_token'])
    _assert_authorised(_call(client, method, path(world), payload, fmt), f'{role} with {module} (real JWT)')


@pytest.mark.parametrize('role', sorted(ASSIGNABLE_EXECUTIVE_ROLES))
def test_modules_assigned_are_exactly_what_unlocks(role):
    user = _make_user(role, sorted(EXECUTIVE_MODULE_KEYS))
    assert all(user_has_module(user, key) for key in EXECUTIVE_MODULE_KEYS)


# ---------------------------------------------------------------------------
# The app registry never hides a route from an executive
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('role', ['CEO', 'CTO'])
def test_registry_gives_founders_every_claimed_route(role):
    user = _make_user(role)
    data = _bearer(_login(user)['access_token']).get(API + 'registry/my-apps/').data
    assert data['is_platform_executive'] is True
    assert set(data['claimed_routes']) <= set(data['routes'])


@pytest.mark.parametrize('role', sorted(ASSIGNABLE_EXECUTIVE_ROLES))
def test_registry_gives_other_executives_only_their_routes(role):
    user = _make_user(role, ['support'])
    data = _bearer(_login(user)['access_token']).get(API + 'registry/my-apps/').data
    assert data['is_platform_executive'] is True
    assert '/dashboard/support' in set(data['routes'])
    assert set(data['routes']) < set(data['claimed_routes'])


# ---------------------------------------------------------------------------
# The repair command
# ---------------------------------------------------------------------------

def test_check_command_is_a_dry_run_by_default():
    user = _make_user('COO', ['schools'])
    user.allowed_modules = 'schools'  # malformed
    user.sessions_valid_after = timezone.now()
    user.save(update_fields=['allowed_modules', 'sessions_valid_after'])
    out = StringIO()
    call_command('check_executive_accounts', stdout=out)
    user.refresh_from_db()
    assert user.allowed_modules == 'schools' and user.sessions_valid_after is not None
    assert 'DRY RUN' in out.getvalue() and 'would repair' in out.getvalue()


def test_check_command_apply_repairs_safe_things_only():
    user = _make_user('COO', ['schools', 'nonsense'])
    user.sessions_valid_after = timezone.now()
    user.must_change_password = True
    user.is_active = False
    user.save(update_fields=['allowed_modules', 'sessions_valid_after', 'must_change_password', 'is_active'])
    call_command('check_executive_accounts', '--apply', '--matricule', user.matricule, stdout=StringIO())
    user.refresh_from_db()
    assert user.allowed_modules == ['schools']  # unknown key dropped, nothing granted
    assert user.sessions_valid_after is None
    # Opt-in repairs were not requested, so they are untouched.
    assert user.must_change_password is True and user.is_active is False

    call_command(
        'check_executive_accounts', '--apply', '--reactivate', '--clear-must-change',
        '--matricule', user.matricule, stdout=StringIO(),
    )
    user.refresh_from_db()
    assert user.is_active is True and user.must_change_password is False


def test_check_command_never_assigns_modules():
    user = _make_user('DESIGNER')
    out = StringIO()
    call_command('check_executive_accounts', '--apply', '--matricule', user.matricule, stdout=out)
    user.refresh_from_db()
    assert user.allowed_modules == []
    assert 'NO modules assigned' in out.getvalue()


def test_check_command_ignores_school_users():
    teacher = _make_user('TEACHER')
    teacher.is_active = False
    teacher.save(update_fields=['is_active'])
    call_command('check_executive_accounts', '--apply', stdout=StringIO())
    teacher.refresh_from_db()
    assert teacher.is_active is False
    assert User.objects.filter(pk=teacher.pk).exists()
