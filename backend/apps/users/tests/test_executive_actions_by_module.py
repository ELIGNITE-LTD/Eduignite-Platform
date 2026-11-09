"""Executive activities are assigned by the founders, never by account type.

The rule under test: any non-founder executive (COO, INV, DESIGNER, SYSTEM_DEV,
SUPER_ADMIN, whatever its label) can do exactly the activities of the modules
assigned to the account; CEO and CTO always can; the founder-only list stays
founder-only however many modules an executive holds.
"""

import re
from pathlib import Path

import pytest
from rest_framework.test import APIClient

from apps.users.executive_access import (
    ASSIGNABLE_EXECUTIVE_ROLES,
    FounderOnly,
    executive_may_open_route,
    has_platform_school_access,
    user_has_module,
)
from apps.users.executive_modules import (
    EXECUTIVE_MODULE_KEYS,
    GENERAL_EXECUTIVE_ROUTES,
    MODULES_BY_HREF,
)
from apps.schools.models import School
from apps.users.tests.test_executive_module_access import API, _make_user

pytestmark = pytest.mark.django_db

ROLES = sorted(ASSIGNABLE_EXECUTIVE_ROLES)
NEW_MODULES = ('proprietors', 'platform_billing', 'school_websites')
REPO = Path(__file__).resolve().parents[4]


class _Lite:
    def __init__(self):
        self.school = School.objects.create(
            id='EXEC-LITE-1', name='Lite School', short_name='LS', principal='P', location='Douala',
            email='lite@example.com', phone='237650100299', school_type='general', subsystem='bilingual',
        )
        self.teacher = _make_user('TEACHER', school=self.school)


@pytest.fixture
def world():
    from django.core.cache import cache

    cache.clear()  # the AI credit config and platform settings are cached
    return _Lite()


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _ok(response):
    """Past the permission check: not 401/403/404/405 and no server error."""
    return response.status_code not in (401, 403, 404, 405) and response.status_code < 500


# ---------------------------------------------------------------------------
# Catalogue: every assignable activity has a module, backend == frontend
# ---------------------------------------------------------------------------

def test_new_modules_are_in_the_catalogue():
    for key in NEW_MODULES:
        assert key in EXECUTIVE_MODULE_KEYS


def test_assignable_roles_are_every_executive_except_the_founders():
    assert ASSIGNABLE_EXECUTIVE_ROLES == {'SUPER_ADMIN', 'COO', 'INV', 'DESIGNER', 'SYSTEM_DEV'}


def _ts(path):
    return (REPO / 'apps' / 'website' / 'src' / path).read_text(encoding='utf-8')


def test_frontend_catalogue_matches_backend():
    keys = re.findall(r'\{ key: "([a-z_]+)"', _ts('lib/executive-modules.ts'))
    assert set(keys) == EXECUTIVE_MODULE_KEYS and len(keys) == len(set(keys))


def test_frontend_routes_match_backend():
    src = _ts('lib/executive-modules.ts')
    general = re.search(r'GENERAL_EXECUTIVE_ROUTES = \[(.*?)\];', src, re.S).group(1)
    assert re.findall(r'"([^"]+)"', general) == GENERAL_EXECUTIVE_ROUTES
    block = re.search(r'MODULES_BY_HREF: Record<string, string\[\]> = \{(.*?)\n\};', src, re.S).group(1)
    parsed = {}
    for href, mods in re.findall(r'"([^"]+)": \[(.*?)\]', block):
        parsed[href] = re.findall(r'"([^"]+)"', mods)
    assert parsed == MODULES_BY_HREF
    for mods in MODULES_BY_HREF.values():
        assert set(mods) <= EXECUTIVE_MODULE_KEYS


def test_every_module_has_a_page_to_work_in():
    src = _ts('lib/executive-modules.ts')
    block = re.search(r'HREF_BY_MODULE: Record<string, string> = \{(.*?)\n\};', src, re.S).group(1)
    assert set(re.findall(r'^\s+([a-z_]+):', block, re.M)) == EXECUTIVE_MODULE_KEYS


def test_mobile_and_desktop_share_the_same_module_file():
    base = _ts('lib/executive-modules.ts')
    for app in ('mobile', 'desktop'):
        assert (REPO / 'apps' / app / 'src' / 'lib' / 'executive-modules.ts').read_text(encoding='utf-8') == base


# ---------------------------------------------------------------------------
# Role label does not matter
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('module', sorted(EXECUTIVE_MODULE_KEYS))
def test_same_modules_give_identical_access_to_every_role(module):
    users = [_make_user(role, [module]) for role in ROLES]
    assert all(user_has_module(u, module) for u in users)
    others = EXECUTIVE_MODULE_KEYS - {module}
    for u in users:
        assert not any(user_has_module(u, other) for other in others)


def test_roles_with_equal_modules_see_the_same_routes():
    coo = _make_user('COO', ['support', 'announcements'])
    designer = _make_user('DESIGNER', ['support', 'announcements'])
    paths = list(MODULES_BY_HREF) + GENERAL_EXECUTIVE_ROUTES + ['/dashboard/students', '/dashboard/founders']
    assert [executive_may_open_route(coo, p) for p in paths] == [executive_may_open_route(designer, p) for p in paths]


# (module, method, url, payload). Representative endpoints, including the new modules.
GATED = [
    ('proprietors', 'get', 'users/proprietors/', None),
    ('platform_billing', 'get', 'platform/billing/schools/', None),
    ('platform_billing', 'patch', 'platform/settings/', {'per_student_fee': '987'}),
    ('school_websites', 'get', 'schools/public-site/schools/', None),
    ('school_websites', 'post', 'schools/public-site/schools/{school}/force-unpublish/', {}),
    ('school_websites', 'post', 'schools/public-site/schools/{school}/unlock/', {}),
    ('schools', 'post', 'schools/schools/{school}/toggle_status/', {'status': 'Active'}),
    ('support', 'get', 'platform/contact-messages/', None),
    ('app_registry', 'get', 'registry/catalogue/', None),
    ('portfolio_policy', 'post', 'platform/events/', {}),
]


def _url(world, url):
    return API + url.format(school=world.school.id)


@pytest.mark.parametrize('module,method,url,payload', GATED)
@pytest.mark.parametrize('role', ROLES)
def test_module_unlocks_and_absence_blocks(world, module, method, url, payload, role):
    with_module = _client(_make_user(role, [module]))
    without = _client(_make_user(role, [m for m in EXECUTIVE_MODULE_KEYS if m != module]))
    target = _url(world, url)
    call = lambda c: getattr(c, method)(target, payload or {}, format='json')  # noqa: E731
    # Refusal first: a successful write by the module holder would otherwise
    # leave the value already changed for the next call.
    assert call(without).status_code == 403, f'{role} holding everything but {module} must be refused'
    allowed = call(with_module)
    assert _ok(allowed), f'{role} with {module}: {allowed.status_code}'


@pytest.mark.parametrize('module,method,url,payload', GATED)
@pytest.mark.parametrize('role', ['CEO', 'CTO'])
def test_founders_always_allowed(world, module, method, url, payload, role):
    response = getattr(_client(_make_user(role)), method)(_url(world, url), payload or {}, format='json')
    assert _ok(response), response.status_code


def test_platform_billing_settings_need_the_billing_module():
    portfolio_only = _make_user('COO', ['portfolio_policy'])
    r = _client(portfolio_only).patch(API + 'platform/settings/', {'per_student_fee': '999'}, format='json')
    assert r.status_code == 403
    billing = _make_user('COO', ['platform_billing', 'portfolio_policy'])
    assert _ok(_client(billing).patch(API + 'platform/settings/', {'per_student_fee': '999'}, format='json'))


# ---------------------------------------------------------------------------
# Founder-only: denied to every executive even holding every module
# ---------------------------------------------------------------------------

FOUNDER_ONLY = [
    ('post', 'platform/fees/', {'role': 'STUDENT', 'amount': '500'}),
    ('post', 'platform/upload-logo/', {}),
    ('patch', 'platform/settings/', {'name': 'Renamed Platform'}),
    ('patch', 'platform/settings/', {'maintenance_mode': True}),
    ('patch', 'platform/settings/', {'fees': {'TEACHER': 5}}),
    ('post', 'schools/schools/{school}/permanent-delete/', {}),
    ('post', 'users/{teacher}/toggle_license/', {'is_license_paid': True}),
    ('post', 'users/{teacher}/update_role/', {'role': 'PARENT'}),
    ('post', 'users/{teacher}/hard-delete/', {}),
    ('post', 'users/founders/', {}),
    ('patch', 'ai/credits/admin/config/', {}),
    ('post', 'users/', {'role': 'COO', 'name': 'New Exec', 'email': 'x@example.com'}),
]


@pytest.mark.parametrize('method,url,payload', FOUNDER_ONLY)
@pytest.mark.parametrize('role', ROLES)
def test_founder_only_stays_founder_only(world, method, url, payload, role):
    everything = _make_user(role, sorted(EXECUTIVE_MODULE_KEYS))
    target = API + url.format(school=world.school.id, teacher=world.teacher.id)
    response = getattr(_client(everything), method)(target, payload, format='json')
    assert response.status_code in (400, 403, 404, 405), f'{role} reached a founder-only action: {response.status_code}'
    if url == 'users/' or 'permanent' in url or 'fees' in url or 'upload-logo' in url or 'settings' in url:
        assert response.status_code in (400, 403), f'{role}: {response.status_code}'


def test_founder_only_permission_class():
    class Req:
        def __init__(self, user):
            self.user = user

    gate = FounderOnly()
    assert gate.has_permission(Req(_make_user('CEO')), None)
    assert gate.has_permission(Req(_make_user('CTO')), None)
    for role in ROLES:
        assert not gate.has_permission(Req(_make_user(role, sorted(EXECUTIVE_MODULE_KEYS))), None)


def test_schools_module_cannot_suspend_or_edit_another_executive(world):
    manager = _make_user('COO', ['schools'])
    victim = _make_user('INV')
    client = _client(manager)
    assert client.post(API + f'users/{victim.id}/suspend/', {'days': 3, 'reason': 'x'}, format='json').status_code == 403
    assert client.patch(API + f'users/{victim.id}/', {'name': 'Hacked'}, format='json').status_code == 403
    # Ordinary school staff are still manageable with the module.
    assert _ok(client.post(API + f'users/{world.teacher.id}/suspend/', {'days': 3, 'reason': 'x'}, format='json'))


def test_assigning_a_module_takes_effect_on_the_next_request(world):
    user = _make_user('COO')
    client = _client(user)
    assert client.get(API + 'platform/billing/schools/').status_code == 403
    user.allowed_modules = ['platform_billing']
    user.save(update_fields=['allowed_modules'])
    assert _ok(client.get(API + 'platform/billing/schools/'))
    user.allowed_modules = []
    user.save(update_fields=['allowed_modules'])
    assert client.get(API + 'platform/billing/schools/').status_code == 403


# ---------------------------------------------------------------------------
# Library / academics / notifications / app store / community now follow modules
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('role', ROLES)
def test_school_wide_access_follows_the_schools_module(role):
    assert has_platform_school_access(_make_user(role, ['schools']))
    assert not has_platform_school_access(_make_user(role, ['support']))
    assert not has_platform_school_access(_make_user(role))
    assert has_platform_school_access(_make_user('CEO'))


@pytest.mark.parametrize('role', ROLES)
def test_app_store_writes_need_the_app_registry_module(role):
    from rest_framework.test import APIRequestFactory

    from apps.app_store.permissions import IsAppStoreManagerOrReadOnly

    request = APIRequestFactory().post('/x/')
    request.user = _make_user(role, ['app_registry'])
    assert IsAppStoreManagerOrReadOnly().has_permission(request, None)
    request.user = _make_user(role, ['schools'])
    assert not IsAppStoreManagerOrReadOnly().has_permission(request, None)


@pytest.mark.parametrize('role', ROLES)
def test_managed_notifications_need_the_announcements_module(role):
    from rest_framework.test import APIRequestFactory

    from apps.notifications.permissions import CanManagePlatformNotifications

    request = APIRequestFactory().post('/x/')
    request.user = _make_user(role, ['announcements'])
    assert CanManagePlatformNotifications().has_permission(request, None)
    request.user = _make_user(role, ['schools'])
    assert not CanManagePlatformNotifications().has_permission(request, None)


# ---------------------------------------------------------------------------
# Navigation: general tabs + assigned modules only; registry routes
# ---------------------------------------------------------------------------

HIDDEN_ALWAYS = [
    '/dashboard/students', '/dashboard/fees', '/dashboard/attendance', '/dashboard/grades', '/dashboard/staff',
    '/dashboard/hierarchy', '/dashboard/courses', '/dashboard/ai-assistant', '/dashboard/founders',
    '/dashboard/settings', '/dashboard/workspace', '/dashboard/referrals',
]


@pytest.mark.parametrize('role', ROLES)
def test_no_modules_means_only_the_general_tabs(role):
    user = _make_user(role)
    for path in GENERAL_EXECUTIVE_ROUTES:
        assert executive_may_open_route(user, path), path
    for path in list(MODULES_BY_HREF) + HIDDEN_ALWAYS:
        assert not executive_may_open_route(user, path), path


@pytest.mark.parametrize('module', sorted(EXECUTIVE_MODULE_KEYS))
@pytest.mark.parametrize('role', ROLES)
def test_one_module_opens_exactly_its_routes(role, module):
    user = _make_user(role, [module])
    opened = {p for p in MODULES_BY_HREF if executive_may_open_route(user, p)}
    assert opened == {p for p, mods in MODULES_BY_HREF.items() if module in mods}
    assert opened, f'{module} must open a page'
    for path in HIDDEN_ALWAYS:
        assert not executive_may_open_route(user, path)


def test_founders_and_school_roles_are_not_restricted_by_the_route_rule():
    assert executive_may_open_route(_make_user('CEO'), '/dashboard/founders')
    assert executive_may_open_route(_make_user('CTO'), '/dashboard/students')
    assert executive_may_open_route(_make_user('TEACHER'), '/dashboard/students')


@pytest.mark.parametrize('role', ROLES)
def test_registry_routes_for_a_limited_executive_are_general_plus_assigned(role):
    user = _make_user(role, ['support'])
    data = _client(user).get(API + 'registry/my-apps/').data
    routes = set(data['routes'])
    assert '/dashboard/support' in routes
    assert not routes & {
        '/dashboard/students', '/dashboard/fees', '/dashboard/attendance', '/dashboard/grades',
        '/dashboard/ai-assistant', '/dashboard/partners', '/dashboard/schools',
    }
    assert all(executive_may_open_route(user, r) for r in routes)
    # The full claim list is kept, so the client can tell these routes are hidden, not core.
    assert '/dashboard/students' in set(data['claimed_routes'])


@pytest.mark.parametrize('role', ROLES)
def test_registry_routes_for_an_executive_without_modules(role):
    data = _client(_make_user(role)).get(API + 'registry/my-apps/').data
    assert all(executive_may_open_route(_make_user(role), r) for r in data['routes'])
    assert '/dashboard/support' not in set(data['routes'])


def test_registry_routes_for_founders_are_unchanged():
    data = _client(_make_user('CEO')).get(API + 'registry/my-apps/').data
    assert {'/dashboard/students', '/dashboard/support'} <= set(data['routes'])
