"""Server-side enforcement of ``User.allowed_modules``.

The frontend only shows an assignable executive tab when its module is in the
executive's ``allowed_modules``. These tests prove the API agrees:

* an executive WITH the module can use every endpoint behind that tab,
* the same role WITHOUT it gets 403,
* the CEO and CTO always pass,
* school-level users keep exactly the access they had.

A response of 400 counts as "authorised" in the matrix: the request got past
the permission check and was rejected by validation (the rows send minimal
payloads on purpose). 401/403/404/5xx never count.
"""

import itertools
import uuid

import pytest
from rest_framework.test import APIClient

from apps.community.models import CommunityBlog, Testimony
from apps.feedback.models import Feedback
from apps.orders.models import Order
from apps.partners.models import ApplicantKind, Partner, PartnerApplication, PartnerType
from apps.platform.models import PlatformFees, PublicEvent, PublicEventType
from apps.schools.models import School
from apps.support.models import SupportContribution
from apps.users.executive_access import (
    ASSIGNABLE_EXECUTIVE_ROLES,
    executive_module_required,
    user_has_module,
)
from apps.users.executive_modules import EXECUTIVE_MODULE_KEYS, clean_modules
from apps.users.models import User

pytestmark = pytest.mark.django_db

API = '/api/v1/'
_counter = itertools.count(1)


def _make_user(role, modules=None, school=None, **extra):
    n = next(_counter)
    return User.objects.create_user(
        matricule=f'EDUTST{n:05d}',
        name=f'{role.title()} Tester {n}',
        email=f'{role.lower()}{n}@example.com',
        role=role,
        password='password123',
        school=school,
        allowed_modules=list(modules or []),
        **extra,
    )


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class World:
    """Real records for every endpoint family, so a 404 means a broken queryset."""

    def __init__(self):
        self.school = School.objects.create(
            id='EXEC-ACC-1', name='Executive Access School', short_name='EAS',
            principal='Principal', location='Douala', email='eas@example.com',
            phone='237650100200', school_type='general', subsystem='bilingual',
        )
        self.other_school = School.objects.create(
            id='EXEC-ACC-2', name='Other Access School', short_name='OAS',
            principal='Principal', location='Buea', email='oas@example.com',
            phone='237650100201', school_type='general', subsystem='bilingual',
        )
        self.drafted_school = School.objects.create(
            id='EXEC-ACC-3', name='Drafted Access School', short_name='DAS',
            principal='Principal', location='Kribi', email='das@example.com',
            phone='237650100202', school_type='general', subsystem='bilingual',
            is_drafted=True,
        )
        self.school_admin = _make_user('SCHOOL_ADMIN', school=self.school)
        self.teacher = _make_user('TEACHER', school=self.school)
        self.other_teacher = _make_user('TEACHER', school=self.other_school)
        self.drafted_user = _make_user('TEACHER', school=self.school, is_drafted=True, is_active=False)
        self.ceo = _make_user('CEO')
        self.cto = _make_user('CTO')

        self.order = Order.objects.create(
            full_name='Req', occupation='Principal', school_name='Req School',
            whatsapp_number='+237670000000', email='req@example.com',
            region='Littoral', division='Wouri', sub_division='Douala III',
        )
        self.contribution = SupportContribution.objects.create(
            user=self.teacher, amount=1000, payment_method='Cash', phone='670000000',
        )
        self.feedback = Feedback.objects.create(
            sender=self.teacher, school=self.school, subject='Subject', message='Message',
        )
        self.testimony = Testimony.objects.create(
            user=self.teacher, school_name='EAS', role_display='Teacher', message='Great',
        )
        self.fee = PlatformFees.objects.create(role='TEACHER', amount=1000)
        self.event = PublicEvent.objects.create(
            title='Event', type=PublicEventType.NEWS, description='d', url='https://example.com/e',
        )
        self.ptype = PartnerType.objects.create(name='Marketing')
        self.application = PartnerApplication.objects.create(
            partner_type=self.ptype, applicant_kind=ApplicantKind.INDIVIDUAL,
            full_name='Applicant', email='applicant@example.com',
        )
        partner_user = _make_user('PARTNER')
        self.partner = Partner.objects.create(
            user=partner_user, partner_type=self.ptype,
            applicant_kind=ApplicantKind.INDIVIDUAL, display_name='Partner One',
        )


@pytest.fixture
def world():
    from django.core.cache import cache

    cache.clear()  # the AI credit config is cached; the DB rolls back between tests
    built = World()
    from apps.registry import api as registry_api

    for school in (built.school, built.other_school):
        for app_key in ('feedback', 'support', 'announcements', 'community'):
            try:
                registry_api.install(school.id, app_key, by=built.ceo)
            except Exception:  # noqa: BLE001 - a core app needs no install
                pass
    return built


# ---------------------------------------------------------------------------
# user_has_module / the permission factory
# ---------------------------------------------------------------------------

def test_assignable_roles_match_the_frontend():
    assert ASSIGNABLE_EXECUTIVE_ROLES == {'SUPER_ADMIN', 'COO', 'INV', 'DESIGNER', 'SYSTEM_DEV'}


@pytest.mark.parametrize('module', sorted(EXECUTIVE_MODULE_KEYS))
def test_founders_always_have_every_module(module):
    assert user_has_module(_make_user('CEO'), module)
    assert user_has_module(_make_user('CTO'), module)


@pytest.mark.parametrize('role', sorted(ASSIGNABLE_EXECUTIVE_ROLES))
def test_assignable_roles_have_only_their_modules(role):
    user = _make_user(role, ['partners'])
    assert user_has_module(user, 'partners')
    assert not user_has_module(user, 'schools')
    assert not user_has_module(_make_user(role), 'partners')


@pytest.mark.parametrize('role', ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'PARTNER'])
def test_non_executives_have_no_module_even_if_the_field_is_set(role):
    assert not user_has_module(_make_user(role, ['partners']), 'partners')


def test_anonymous_has_no_module():
    from django.contrib.auth.models import AnonymousUser

    assert not user_has_module(AnonymousUser(), 'partners')
    assert not user_has_module(None, 'partners')


def test_malformed_allowed_modules_is_treated_as_empty():
    user = _make_user('COO')
    user.allowed_modules = 'partners'  # a string, not a list
    assert not user_has_module(user, 'partners')


def test_factory_rejects_unknown_modules():
    with pytest.raises(ValueError):
        executive_module_required('nope')


class _FakeRequest:
    def __init__(self, user):
        self.user = user


def test_factory_non_executive_handling():
    teacher = _make_user('TEACHER')
    strict = executive_module_required('partners')()
    shared = executive_module_required('partners', allow_non_executives=True)()
    assert not strict.has_permission(_FakeRequest(teacher), None)
    assert shared.has_permission(_FakeRequest(teacher), None)
    # A shared gate still binds executives.
    assert not shared.has_permission(_FakeRequest(_make_user('COO')), None)
    assert shared.has_permission(_FakeRequest(_make_user('COO', ['partners'])), None)


def test_factory_any_of_modules():
    gate = executive_module_required('testimonials', also=('community',))()
    assert gate.has_permission(_FakeRequest(_make_user('COO', ['community'])), None)
    assert gate.has_permission(_FakeRequest(_make_user('COO', ['testimonials'])), None)
    assert not gate.has_permission(_FakeRequest(_make_user('COO', ['partners'])), None)


# ---------------------------------------------------------------------------
# The endpoint matrix
# ---------------------------------------------------------------------------

def _row(module, method, path, payload=None, label=None, fmt='json'):
    return pytest.param(module, method, path, payload, fmt, id=label or f'{module}:{method} {path}')


# Each path is a callable taking the world so it can embed real ids.
MATRIX = [
    # --- partners -------------------------------------------------------
    _row('partners', 'get', lambda w: 'partners/admin/overview/'),
    _row('partners', 'get', lambda w: 'partners/admin/applications/'),
    _row('partners', 'get', lambda w: f'partners/admin/applications/{w.application.id}/'),
    _row('partners', 'post', lambda w: f'partners/admin/applications/{w.application.id}/review/',
         {'action': 'under_review'}),
    _row('partners', 'get', lambda w: 'partners/admin/partners/'),
    _row('partners', 'get', lambda w: f'partners/admin/partners/{w.partner.id}/'),
    _row('partners', 'patch', lambda w: f'partners/admin/partners/{w.partner.id}/', {'is_public': False}),
    _row('partners', 'post', lambda w: f'partners/admin/partners/{w.partner.id}/action/', {'action': 'activate'}),
    _row('partners', 'get', lambda w: 'partners/admin/performance/'),
    _row('partners', 'get', lambda w: 'partners/admin/types/'),
    _row('partners', 'post', lambda w: 'partners/admin/types/', {'name': 'Brand new type'}),
    _row('partners', 'patch', lambda w: f'partners/admin/types/{w.ptype.id}/', {'description': 'x'}),
    # --- flyer_qr -------------------------------------------------------
    _row('flyer_qr', 'get', lambda w: 'orders/orders/flyer-qr/'),
    # --- support --------------------------------------------------------
    _row('support', 'get', lambda w: 'orders/orders/'),
    _row('support', 'get', lambda w: f'orders/orders/{w.order.id}/'),
    _row('support', 'patch', lambda w: f'orders/orders/{w.order.id}/', {'notes': 'n'}),
    _row('support', 'post', lambda w: f'orders/orders/{w.order.id}/process/', {'status': 'contacted'}),
    _row('support', 'get', lambda w: 'orders/orders/stats/'),
    _row('support', 'get', lambda w: 'platform/contact-messages/'),
    _row('support', 'get', lambda w: 'support/contributions/stats/'),
    _row('support', 'post', lambda w: f'support/contributions/{w.contribution.id}/verify/', {}),
    _row('support', 'post', lambda w: f'support/contributions/{w.contribution.id}/reject/', {}),
    # --- schools (and the account-request orders it works from) ----------
    _row('schools', 'get', lambda w: 'orders/orders/', label='schools:orders list'),
    _row('schools', 'patch', lambda w: f'schools/schools/{w.school.id}/', {'motto': 'Onward'}),
    _row('schools', 'post', lambda w: f'schools/schools/{w.school.id}/toggle_status/', {'status': 'Active'}),
    _row('schools', 'post', lambda w: 'schools/schools/', {}),
    _row('schools', 'delete', lambda w: f'schools/schools/{w.school.id}/', {}),
    _row('schools', 'post', lambda w: 'users/', {}),
    _row('schools', 'patch', lambda w: f'users/{w.teacher.id}/', {'name': 'Renamed Teacher'}),
    _row('schools', 'post', lambda w: f'users/{w.teacher.id}/suspend/', {'days': 3, 'reason': 'x'}),
    _row('schools', 'post', lambda w: f'users/{w.teacher.id}/unsuspend/', {}),
    _row('schools', 'delete', lambda w: f'users/{w.teacher.id}/', {}),
    _row('schools', 'post', lambda w: f'schools/hierarchy/sub-schools/?school_id={w.school.id}',
         {'school_id': 'EXEC-ACC-1'}),
    _row('schools', 'post', lambda w: f'schools/{w.school.id}/classes/', {}),
    _row('schools', 'post', lambda w: f'schools/{w.school.id}/staff/', {}),
    _row('schools', 'patch', lambda w: f'schools/settings/{w.school.id}/calendar/', {}),
    # --- portfolio_policy -----------------------------------------------
    _row('portfolio_policy', 'patch', lambda w: 'platform/settings/', {'contact_email': 'info@example.com'}),
    # (fees, the logo and the platform name are founder-only: see test_executive_actions_by_module)
    _row('portfolio_policy', 'post', lambda w: 'platform/events/', {}),
    _row('portfolio_policy', 'post', lambda w: 'platform/tutorials/', {}),
    _row('portfolio_policy', 'post', lambda w: 'platform/upload-event-media/', {}, fmt='multipart'),
    # --- testimonials (the Community Portal moderates the same queue) ----
    _row('testimonials', 'get', lambda w: 'community/testimonies/pending/'),
    _row('testimonials', 'post', lambda w: f'community/testimonies/{w.testimony.id}/approve/'),
    _row('testimonials', 'post', lambda w: f'community/testimonies/{w.testimony.id}/reject/'),
    _row('testimonials', 'delete', lambda w: f'community/testimonies/{w.testimony.id}/'),
    _row('community', 'get', lambda w: 'community/testimonies/pending/', label='community:pending'),
    _row('community', 'post', lambda w: f'community/testimonies/{w.testimony.id}/approve/', label='community:approve'),
    # --- log_post / community (blogs) -----------------------------------
    _row('log_post', 'post', lambda w: 'community/blogs/', {'title': 'A log', 'paragraphs': ['One']}),
    _row('community', 'post', lambda w: 'community/blogs/', {'title': 'A log', 'paragraphs': ['One']},
         label='community:blog create'),
    # --- app_registry ---------------------------------------------------
    _row('app_registry', 'get', lambda w: 'registry/catalogue/'),
    _row('app_registry', 'get', lambda w: f'registry/schools/{w.school.id}/apps/'),
    _row('app_registry', 'post', lambda w: f'registry/schools/{w.school.id}/apps/', {}),
    _row('app_registry', 'get', lambda w: 'registry/builds/'),
    _row('app_registry', 'post', lambda w: 'registry/builds/upload/', {}, fmt='multipart'),
    # --- ai_economics ---------------------------------------------------
    _row('ai_economics', 'get', lambda w: 'ai/credits/admin/config/'),
    _row('ai_economics', 'get', lambda w: 'ai/credits/admin/economics/'),
    _row('ai_economics', 'get', lambda w: f'ai/credits/admin/account/?user={w.teacher.email}'),
    # --- announcements --------------------------------------------------
    _row('announcements', 'post', lambda w: 'announcements/announcements/',
         {'title': 'Hello', 'content': 'Body', 'target': 'EXECUTIVE'}),
    # --- surveys --------------------------------------------------------
    _row('surveys', 'get', lambda w: 'surveys/managed/'),
    _row('surveys', 'post', lambda w: 'surveys/', {}),
    # --- feedback -------------------------------------------------------
    _row('feedback', 'get', lambda w: 'feedback/feedback/stats/'),
    _row('feedback', 'post', lambda w: f'feedback/feedback/{w.feedback.id}/resolve/', {}),
    _row('feedback', 'post', lambda w: f'feedback/feedback/{w.feedback.id}/respond/', {'message': 'ok'}),
    _row('feedback', 'patch', lambda w: f'feedback/feedback/{w.feedback.id}/', {'priority': 'High'}),
    # --- draft ----------------------------------------------------------
    _row('draft', 'get', lambda w: 'users/?draft=true'),
    _row('draft', 'get', lambda w: 'schools/schools/?draft=true'),
    _row('draft', 'post', lambda w: f'users/{w.drafted_user.id}/restore/'),
    _row('draft', 'post', lambda w: f'schools/schools/{w.drafted_school.id}/restore/'),
    # --- academy (the module implies the CMS scopes) ----------------------
    _row('academy', 'post', lambda w: 'academy/trainers/', {}),
    _row('academy', 'post', lambda w: 'academy/faqs/', {}),
    _row('academy', 'get', lambda w: 'academy/testimonials/'),
]


def _call(client, method, url, payload, fmt):
    func = getattr(client, method)
    if method in ('get', 'delete') and not payload:
        return func(API + url)
    return func(API + url, payload or {}, format=fmt)


def _assert_authorised(response, label):
    assert response.status_code not in (401, 403, 404, 405), (
        f'{label}: expected the request to pass permissions, got {response.status_code} {getattr(response, "data", "")}'
    )
    assert response.status_code < 500, f'{label}: server error {response.status_code} {getattr(response, "data", "")}'


@pytest.mark.parametrize('module,method,path,payload,fmt', MATRIX)
@pytest.mark.parametrize('role', ['COO', 'SUPER_ADMIN'])
def test_executive_with_module_is_authorised(world, module, method, path, payload, fmt, role):
    user = _make_user(role, [module])
    response = _call(_client(user), method, path(world), payload, fmt)
    _assert_authorised(response, f'{role} with {module}')


@pytest.mark.parametrize('module,method,path,payload,fmt', MATRIX)
@pytest.mark.parametrize('role', ['COO', 'INV', 'DESIGNER', 'SYSTEM_DEV', 'SUPER_ADMIN'])
def test_executive_without_module_is_forbidden(world, module, method, path, payload, fmt, role):
    # Holds every module EXCEPT the one under test (and the ones that share it).
    shared = {
        'support': {'schools'}, 'schools': {'support', 'draft'}, 'draft': {'schools'},
        'testimonials': {'community'}, 'community': {'testimonials', 'log_post'}, 'log_post': {'community'},
        'portfolio_policy': set(),
    }
    others = [m for m in EXECUTIVE_MODULE_KEYS if m != module and m not in shared.get(module, set())]
    # The matrix row may be reachable through a sibling module; build the
    # restricted user from the siblings-excluded set so only unrelated modules remain.
    user = _make_user(role, others)
    response = _call(_client(user), method, path(world), payload, fmt)
    assert response.status_code == 403, (
        f'{role} without {module}: {method} {path(world)} gave {response.status_code} {getattr(response, "data", "")}'
    )


# The Academy keeps founder access in per-user grant rows (seeded by a data
# migration), not in the role, so the founders check does not apply to it.
FOUNDER_MATRIX = [row for row in MATRIX if row.values[0] != 'academy']


@pytest.mark.parametrize('module,method,path,payload,fmt', FOUNDER_MATRIX)
@pytest.mark.parametrize('role', ['CEO', 'CTO'])
def test_founders_always_authorised(world, module, method, path, payload, fmt, role):
    user = _make_user(role)
    response = _call(_client(user), method, path(world), payload, fmt)
    _assert_authorised(response, f'{role} on {module}')


# ---------------------------------------------------------------------------
# Rows that are not plain "403 vs authorised"
# ---------------------------------------------------------------------------

def test_support_list_widens_only_with_the_module(world):
    with_module = _client(_make_user('COO', ['support']))
    without = _client(_make_user('COO'))
    assert len(with_module.get(API + 'support/contributions/').data['results']) == 1 \
        if isinstance(with_module.get(API + 'support/contributions/').data, dict) \
        else len(with_module.get(API + 'support/contributions/').data) == 1
    data = without.get(API + 'support/contributions/').data
    rows = data['results'] if isinstance(data, dict) and 'results' in data else data
    assert rows == []  # an executive without the module sees only their own


def test_feedback_list_is_all_with_module_and_own_without(world):
    def rows(user):
        data = _client(user).get(API + 'feedback/feedback/').data
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    assert len(rows(_make_user('COO', ['feedback']))) == 1
    assert rows(_make_user('COO')) == []


def test_pending_testimonies_listing_needs_the_module(world):
    def rows(user):
        data = _client(user).get(API + 'community/testimonies/', {'status': 'pending'}).data
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    assert len(rows(_make_user('COO', ['testimonials']))) == 1
    assert rows(_make_user('COO')) == []


def test_orders_list_is_not_empty_for_a_module_holder(world):
    data = _client(_make_user('COO', ['support'])).get(API + 'orders/orders/').data
    rows = data['results'] if isinstance(data, dict) and 'results' in data else data
    assert len(rows) == 1


def test_flyer_qr_module_does_not_unlock_orders(world):
    client = _client(_make_user('COO', ['flyer_qr']))
    assert client.get(API + 'orders/orders/').status_code == 403
    assert client.get(API + 'orders/orders/flyer-qr/').status_code == 200


def test_public_endpoints_stay_public(world):
    client = APIClient()
    assert client.get(API + 'platform/settings/').status_code == 200
    assert client.get(API + 'platform/fees/').status_code == 200
    assert client.get(API + 'platform/events/').status_code == 200
    assert client.get(API + 'platform/public-testimonials/').status_code == 200
    assert client.get(API + 'partners/types/').status_code == 200
    assert client.get(API + 'community/blogs/').status_code == 200
    assert client.get(API + 'community/testimonies/').status_code == 200


@pytest.mark.parametrize('path', [
    'platform/stats/', 'users/me/', 'users/executives/', 'users/founders/', 'announcements/announcements/',
    'announcements/announcements/my_announcements/', 'registry/my-apps/', 'app-store/apps/', 'surveys/',
    'surveys/access/', 'schools/schools/', 'schools/schools/stats/', 'users/stats/', 'orders/orders/my-referral/',
    'ai/credits/', 'feedback/feedback/my_feedback/', 'notifications/',
])
def test_default_tab_endpoints_work_for_an_executive_with_no_modules(world, path):
    response = _client(_make_user('COO')).get(API + path)
    assert response.status_code not in (401, 403, 404, 405) and response.status_code < 500, (
        f'{path}: {response.status_code}'
    )


# ---------------------------------------------------------------------------
# Founder-only by design: a module does not unlock these
# ---------------------------------------------------------------------------

FOUNDER_ONLY = [
    ('ai_economics', 'patch', lambda w: 'ai/credits/admin/config/', {'markup_percent': 10}),
    ('ai_economics', 'post', lambda w: 'ai/credits/admin/adjust/', {'user': 'x', 'amount': 5, 'reason': 'r'}),
    ('schools', 'post', lambda w: f'schools/schools/{w.school.id}/subscription/status/', {'status': 'paid'}),
    ('schools', 'post', lambda w: f'schools/schools/{w.school.id}/subscription/amount/', {'amount': 100}),
    ('schools', 'post', lambda w: f'schools/schools/{w.school.id}/permanent-delete/', {}),
    ('draft', 'post', lambda w: f'users/{w.drafted_user.id}/hard-delete/', {}),
    ('schools', 'post', lambda w: f'users/{w.teacher.id}/hard-delete/', {}),
    ('schools', 'post', lambda w: f'users/{w.teacher.id}/update_role/', {'role': 'PARENT'}),
    ('schools', 'post', lambda w: f'users/{w.teacher.id}/toggle_license/', {'is_license_paid': True}),
    ('announcements', 'post', lambda w: 'announcements/audience-grants/', {}),
    ('surveys', 'post', lambda w: 'surveys/publishers/', {}),
]


@pytest.mark.parametrize('module,method,path,payload', FOUNDER_ONLY)
def test_coo_with_module_cannot_do_founder_only_actions(world, module, method, path, payload):
    coo = _make_user('COO', list(EXECUTIVE_MODULE_KEYS))
    response = _call(_client(coo), method, path(world), payload, 'json')
    assert response.status_code == 403, f'{method} {path(world)} -> {response.status_code}'


@pytest.mark.parametrize('module,method,path,payload', FOUNDER_ONLY)
def test_ceo_passes_the_founder_only_permission_layer(world, module, method, path, payload):
    response = _call(_client(world.ceo), method, path(world), payload, 'json')
    assert response.status_code != 403, f'{method} {path(world)} -> 403 for the CEO'


# ---------------------------------------------------------------------------
# Specific behaviours
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('module', ['portfolio_policy', 'testimonials', 'log_post', 'community'])
def test_public_site_control_is_open_to_website_content_modules_only(world, module):
    assert _client(_make_user('COO', [module])).get(API + 'platform/public-site/').status_code == 200
    assert _client(_make_user('COO', ['partners', 'support'])).get(API + 'platform/public-site/').status_code == 403
    assert _client(world.ceo).post(API + 'platform/public-site/').status_code == 200


def test_maintenance_mode_is_founder_only_but_resaving_the_form_is_fine(world):
    coo = _client(_make_user('COO', ['portfolio_policy']))
    # The settings page posts the whole form, including the unchanged value.
    assert coo.patch(API + 'platform/settings/', {'name': 'X', 'maintenance_mode': False}, format='json').status_code == 200
    assert coo.patch(API + 'platform/settings/', {'maintenance_mode': True}, format='json').status_code == 403
    assert _client(world.ceo).patch(API + 'platform/settings/', {'maintenance_mode': True}, format='json').status_code == 200


def test_integration_secrets_remain_founder_tier(world):
    assert _client(_make_user('COO', list(EXECUTIVE_MODULE_KEYS))).get(API + 'platform/integration-secrets/').status_code == 403
    assert _client(world.ceo).get(API + 'platform/integration-secrets/').status_code == 200


def test_ai_adjust_works_for_the_ceo(world):
    response = _client(world.ceo).post(
        API + 'ai/credits/admin/adjust/', {'user': world.teacher.email, 'amount': 5, 'reason': 'goodwill'}, format='json',
    )
    assert response.status_code == 201


def test_survey_module_holder_manages_all_surveys_but_cannot_authorise_publishers(world):
    coo = _make_user('COO', ['surveys'])
    client = _client(coo)
    assert client.get(API + 'surveys/access/').data['can_publish'] is True
    assert client.get(API + 'surveys/access/').data['can_manage_publishers'] is False
    assert _client(_make_user('COO')).get(API + 'surveys/access/').data['can_publish'] is False


def test_announcements_module_controls_authoring_not_the_feed(world):
    without = _client(_make_user('COO'))
    assert without.get(API + 'announcements/announcements/').status_code == 200
    assert without.get(API + 'announcements/announcements/audiences/').data['can_publish'] is False
    assert without.post(
        API + 'announcements/announcements/', {'title': 'T', 'content': 'C', 'target': 'EXECUTIVE'}, format='json',
    ).status_code == 403
    coo = _make_user('COO', ['announcements'])
    created = _client(coo).post(
        API + 'announcements/announcements/', {'title': 'T', 'content': 'C', 'target': 'EXECUTIVE'}, format='json',
    )
    assert created.status_code == 201
    # Losing the module removes the right to edit or delete their own announcement.
    coo.allowed_modules = []
    coo.save()
    from apps.announcements.models import Announcement

    announcement_id = Announcement.objects.get(sender=coo).id
    assert _client(coo).delete(API + f'announcements/announcements/{announcement_id}/').status_code == 403
    assert _client(coo).patch(
        API + f'announcements/announcements/{announcement_id}/', {'title': 'New'}, format='json',
    ).status_code == 403


def test_blog_author_with_module_manages_own_posts_only(world):
    coo = _make_user('COO', ['log_post'])
    other = _make_user('INV', ['log_post'])
    mine = _client(coo).post(API + 'community/blogs/', {'title': 'Mine', 'paragraphs': ['a']}, format='json')
    assert mine.status_code == 201
    blog_id = mine.data['id']
    assert _client(coo).patch(API + f'community/blogs/{blog_id}/', {'title': 'Mine 2'}, format='json').status_code == 200
    # Another module holder cannot edit someone else's post (founders can).
    assert _client(other).patch(API + f'community/blogs/{blog_id}/', {'title': 'Hijack'}, format='json').status_code == 403
    assert _client(world.ceo).patch(API + f'community/blogs/{blog_id}/', {'title': 'CEO edit'}, format='json').status_code == 200
    assert _client(coo).delete(API + f'community/blogs/{blog_id}/').status_code == 204


def test_executive_without_blog_module_cannot_write_posts_but_can_read(world):
    blog = CommunityBlog.objects.create(author=world.ceo, title='Live', paragraphs=['x'], is_published=True)
    draft = CommunityBlog.objects.create(author=world.ceo, title='Draft', paragraphs=['x'], is_published=False)
    coo = _client(_make_user('COO'))
    assert coo.get(API + f'community/blogs/{blog.id}/').status_code == 200
    assert coo.get(API + f'community/blogs/{draft.id}/').status_code == 404  # drafts stay hidden
    assert coo.post(API + 'community/blogs/', {'title': 'T', 'paragraphs': ['a']}, format='json').status_code == 403
    assert coo.post(API + f'community/blogs/{draft.id}/publish/').status_code == 403
    assert _client(_make_user('COO', ['log_post'])).get(API + f'community/blogs/{draft.id}/').status_code == 200


def test_event_visibility_follows_the_module(world):
    PublicEvent.objects.create(
        title='Hidden', type=PublicEventType.NEWS, description='d', url='https://example.com/h', is_active=False,
    )

    def count(client):
        data = client.get(API + 'platform/events/').data
        rows = data['results'] if isinstance(data, dict) and 'results' in data else data
        return len(rows)

    assert count(_client(_make_user('COO', ['portfolio_policy']))) > count(_client(_make_user('COO')))


def test_users_self_edit_is_not_gated_by_modules(world):
    coo = _make_user('COO')
    response = _client(coo).patch(API + f'users/{coo.id}/', {'name': 'My New Name'}, format='json')
    assert response.status_code == 200, response.data
    coo.refresh_from_db()
    assert coo.name == 'My New Name'


def test_users_draft_list_needs_draft_module(world):
    coo = _client(_make_user('COO'))
    assert coo.get(API + 'users/?draft=true').status_code == 403
    assert coo.get(API + 'schools/schools/?draft=true').status_code == 403
    assert coo.get(API + 'users/').status_code == 200


def test_academy_module_does_not_imply_course_governance(world):
    coo = _client(_make_user('COO', ['academy']))
    assert coo.post(API + 'academy/faqs/', {}, format='json').status_code != 403
    assert coo.post(API + 'academy/courses/', {}, format='json').status_code == 403  # COURSE_CREATE is a per-user grant
    assert coo.post(API + 'academy/permissions/grant/', {}, format='json').status_code == 403


def test_academy_explicit_scope_grants_still_work_without_the_module(world):
    from apps.academy.models import AcademyPermission

    coo = _make_user('COO')
    AcademyPermission.objects.create(user=coo, scope=AcademyPermission.Scope.ACM_READ)
    assert _client(coo).get(API + 'academy/testimonials/').status_code == 200


# ---------------------------------------------------------------------------
# School-level behaviour must not change
# ---------------------------------------------------------------------------

def test_school_admin_still_manages_their_own_school(world):
    admin = _client(world.school_admin)
    assert admin.patch(API + f'schools/schools/{world.school.id}/', {'motto': 'Ours'}, format='json').status_code == 200
    # ...but not another school (the queryset hides it).
    assert admin.patch(API + f'schools/schools/{world.other_school.id}/', {'motto': 'Theirs'}, format='json').status_code == 404
    # And never the school-creating, executive-only action.
    assert admin.post(API + 'schools/schools/', {}, format='json').status_code == 403


def test_teacher_still_cannot_edit_a_school(world):
    assert _client(world.teacher).patch(
        API + f'schools/schools/{world.school.id}/', {'motto': 'Nope'}, format='json',
    ).status_code == 403


def test_school_admin_can_still_suspend_and_restore_own_school_users(world):
    admin = _client(world.school_admin)
    assert admin.post(API + f'users/{world.teacher.id}/suspend/', {'days': 2, 'reason': 'x'}, format='json').status_code == 200
    assert admin.post(API + f'users/{world.teacher.id}/unsuspend/').status_code == 200
    assert admin.post(API + f'users/{world.drafted_user.id}/restore/').status_code == 200
    # Another school's user stays out of reach.
    assert admin.post(API + f'users/{world.other_teacher.id}/suspend/', {'days': 2}, format='json').status_code == 404


def test_school_admin_and_teacher_feedback_scoping_is_unchanged(world):
    def rows(user):
        data = _client(user).get(API + 'feedback/feedback/').data
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    assert len(rows(world.school_admin)) == 1  # their school's feedback
    assert len(rows(world.teacher)) == 1  # their own
    assert rows(world.other_teacher) == []
    resolved = _client(world.school_admin).post(API + f'feedback/feedback/{world.feedback.id}/resolve/', {}, format='json')
    assert resolved.status_code == 200
    assert _client(world.teacher).post(
        API + f'feedback/feedback/{world.feedback.id}/resolve/', {}, format='json',
    ).status_code == 403


def test_teacher_support_contributions_are_still_their_own(world):
    data = _client(world.teacher).get(API + 'support/contributions/').data
    rows = data['results'] if isinstance(data, dict) and 'results' in data else data
    assert len(rows) == 1
    assert _client(world.other_teacher).get(API + 'support/contributions/').data in ([], {'count': 0, 'next': None, 'previous': None, 'results': []}) \
        or len(_client(world.other_teacher).get(API + 'support/contributions/').data.get('results', [])) == 0
    assert _client(world.teacher).post(
        API + f'support/contributions/{world.contribution.id}/verify/', {}, format='json',
    ).status_code == 403


def test_school_admin_announcements_stay_school_scoped(world):
    admin = _client(world.school_admin)
    ok = admin.post(API + 'announcements/announcements/', {'title': 'T', 'content': 'C', 'target': 'TEACHER'}, format='json')
    assert ok.status_code == 201, ok.data
    platform = admin.post(
        API + 'announcements/announcements/', {'title': 'T', 'content': 'C', 'target': 'ALL_EDUIGNITE_USERS'}, format='json',
    )
    assert platform.status_code == 400
    assert _client(world.teacher).get(API + 'announcements/announcements/audiences/').data['can_publish'] is True


def test_non_executives_never_reach_executive_endpoints(world):
    for user in (world.school_admin, world.teacher):
        client = _client(user)
        assert client.get(API + 'partners/admin/overview/').status_code == 403
        assert client.get(API + 'registry/catalogue/').status_code == 403
        assert client.get(API + 'ai/credits/admin/economics/').status_code == 403
        assert client.get(API + 'orders/orders/').status_code == 403
        assert client.get(API + 'platform/contact-messages/').status_code == 403


# ---------------------------------------------------------------------------
# Security fixes found while auditing
# ---------------------------------------------------------------------------

def test_a_school_member_cannot_change_their_schools_subscription(world):
    for user in (world.school_admin, world.teacher):
        client = _client(user)
        for suffix, payload in (('status', {'status': 'paid'}), ('amount', {'amount': 1})):
            response = client.post(API + f'schools/schools/{world.school.id}/subscription/{suffix}/', payload, format='json')
            assert response.status_code == 403
    world.school.refresh_from_db()
    assert world.school.subscription_status != 'paid'


def test_a_user_cannot_change_their_own_role(world):
    teacher = world.teacher
    response = _client(teacher).post(API + f'users/{teacher.id}/update_role/', {'role': 'CEO'}, format='json')
    assert response.status_code == 403
    teacher.refresh_from_db()
    assert teacher.role == 'TEACHER'
    assert _client(world.ceo).post(API + f'users/{teacher.id}/update_role/', {'role': 'BURSAR'}, format='json').status_code == 200


# ---------------------------------------------------------------------------
# allowed_modules validation
# ---------------------------------------------------------------------------

def test_clean_modules_drops_unknown_keys_and_dedupes():
    assert clean_modules(['partners', 'bogus', 'partners', ' schools ', 7, None]) == ['partners', 'schools']
    assert clean_modules('partners') == []
    assert clean_modules(None) == []
    assert clean_modules([]) == []


def _founder_payload(**extra):
    unique = uuid.uuid4().hex[:8]
    payload = {
        'name': f'New Exec {unique}', 'email': f'exec-{unique}@example.com', 'phone': '670000000',
        'role': 'COO', 'founder_title': 'Head of Operations',
    }
    payload.update(extra)
    return payload


def test_creating_an_executive_stores_cleaned_modules(world):
    response = _client(world.ceo).post(
        API + 'users/founders/',
        _founder_payload(allowed_modules=['partners', 'nonsense', 'partners', 'schools']),
        format='json',
    )
    assert response.status_code == 201, response.data
    created = User.objects.get(email=response.data['email'])
    assert created.allowed_modules == ['partners', 'schools']
    assert response.data['allowed_modules'] == ['partners', 'schools']


def test_updating_an_executive_replaces_modules(world):
    created = _client(world.ceo).post(
        API + 'users/founders/', _founder_payload(allowed_modules=['partners']), format='json',
    )
    from apps.users.models import FounderProfile

    founder_id = FounderProfile.objects.get(user__email=created.data['email']).id
    response = _client(world.ceo).patch(
        API + f'users/founders/{founder_id}/', {'allowed_modules': ['support', 'support', 'x', 'feedback']}, format='json',
    )
    assert response.status_code == 200, response.data
    assert User.objects.get(email=created.data['email']).allowed_modules == ['support', 'feedback']
    cleared = _client(world.ceo).patch(API + f'users/founders/{founder_id}/', {'allowed_modules': []}, format='json')
    assert cleared.status_code == 200
    assert User.objects.get(email=created.data['email']).allowed_modules == []


def test_only_founders_can_assign_modules(world):
    coo = _client(_make_user('COO', list(EXECUTIVE_MODULE_KEYS)))
    assert coo.post(API + 'users/founders/', _founder_payload(allowed_modules=['partners']), format='json').status_code == 403


def test_a_user_cannot_grant_themselves_modules_through_profile_endpoints(world):
    coo = _make_user('COO')
    client = _client(coo)
    client.patch(API + f'users/{coo.id}/', {'allowed_modules': list(EXECUTIVE_MODULE_KEYS)}, format='json')
    client.patch(API + 'users/me/', {'allowed_modules': list(EXECUTIVE_MODULE_KEYS)}, format='json')
    coo.refresh_from_db()
    assert coo.allowed_modules == []
