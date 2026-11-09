"""Executive activity log: what is recorded, and how it is captured.

Two ways in, both through :func:`record_executive_activity`:

* ``ExecutiveActivityMiddleware`` records, after the response, every write
  (POST/PUT/PATCH/DELETE) made by a signed-in platform executive or founder,
  plus a small set of sensitive reads (exports, downloads, secrets). Denied
  attempts (401/403 for a known account) are recorded with outcome ``denied``.
* Explicit calls (login, failed login) from the authentication views.

What is never stored: request or response bodies, passwords, tokens, message
text, query strings. The module key comes from the URL prefix registry below,
which mirrors ``MODULE_BY_HREF`` / ``apps.users.executive_modules``.

Logging must never break a request: every public entry point swallows and logs
its own errors.
"""

import json
import logging
import re
import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.utils import get_client_ip

from .executive_activity_model import ExecutiveActivityLog

logger = logging.getLogger(__name__)

API_PREFIX = '/api/v1/'
DISPLAY_TIMEZONE = 'Africa/Douala'

# Roles that count as "executive" for the log: founders plus every staff role.
EXECUTIVE_ROLES = frozenset({'CEO', 'CTO', 'SUPER_ADMIN', 'COO', 'INV', 'DESIGNER', 'SYSTEM_DEV'})
FOUNDER_ROLES = frozenset({'CEO', 'CTO'})

# How a department is shown to the founders (the stored role key never changes).
DEPARTMENT_LABELS = {
    'CEO': 'Chief Executive Officer',
    'CTO': 'Chief Technology Officer',
    'COO': 'Operational Department',
    'DESIGNER': 'Marketing Department',
    'SYSTEM_DEV': 'Systems Department',
    'INV': 'Investor',
    'SUPER_ADMIN': 'Super Admin',
}

SAFE_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS'})

# URL prefix (after /api/v1/) -> executive module key. Longest prefix wins.
# Keys are the ones in apps.users.executive_modules plus 'founders', 'accounts',
# 'authentication' and 'general' for activity outside an assignable module.
MODULE_PREFIXES = (
    ('users/founders', 'founders'),
    ('users/proprietors', 'founders'),
    ('users', 'accounts'),
    ('auth', 'authentication'),
    ('schools', 'schools'),
    ('students', 'schools'),
    ('support', 'support'),
    ('platform/contact-messages', 'support'),
    ('platform/public-testimonials', 'testimonials'),
    ('site-oversight', 'school_websites'),
    ('platform/public-site', 'portfolio_policy'),
    ('platform/executive-activity', 'executive_activity'),
    ('platform/integration-secrets', 'integrations'),
    ('platform/app-versions', 'app_registry'),
    ('platform/billing', 'portfolio_policy'),
    ('platform/settings', 'portfolio_policy'),
    ('platform/fees', 'portfolio_policy'),
    ('platform/events', 'portfolio_policy'),
    ('platform/tutorials', 'portfolio_policy'),
    ('platform/upload', 'portfolio_policy'),
    ('platform', 'portfolio_policy'),
    ('registry', 'app_registry'),
    ('partners', 'partners'),
    ('academy', 'academy'),
    ('community', 'community'),
    ('announcements', 'announcements'),
    ('surveys', 'surveys'),
    ('feedback', 'feedback'),
    ('ai', 'ai_economics'),
)
_PREFIXES_SORTED = tuple(sorted(MODULE_PREFIXES, key=lambda item: -len(item[0])))

# Human nouns for the summary, by URL prefix (otherwise the last path word).
MODULE_LABELS = {
    'founders': 'Founders',
    'accounts': 'Accounts',
    'authentication': 'Sign-in',
    'schools': 'Schools',
    'support': 'Support registry',
    'testimonials': 'Testimonials',
    'flyer_qr': 'Flyer QR',
    'portfolio_policy': 'Portfolio & Policy',
    'log_post': 'Log posts',
    'academy': 'Academy',
    'partners': 'Partners',
    'app_registry': 'App registry',
    'ai_economics': 'AI economics',
    'community': 'Community',
    'announcements': 'Announcements',
    'surveys': 'Surveys',
    'feedback': 'Feedback',
    'draft': 'Drafts',
    'integrations': 'Integration keys',
    'general': 'General',
}

# Writes that are conversation or housekeeping noise, not executive decisions.
SKIP_PREFIXES = ('chat', 'notifications', 'auth/refresh', 'auth/firebase-login', 'auth/login')

# Reads worth recording. Matched against the path (no query string).
SENSITIVE_READ_RE = re.compile(r'(export|download|integration-secrets|secrets)', re.I)
EXPORT_FORMATS = {'csv', 'xlsx', 'pdf', 'xls'}

# Fixed path actions that read better than the HTTP verb.
PATH_ACTIONS = {
    'approve': 'approve', 'reject': 'reject', 'send': 'send', 'publish': 'publish',
    'unpublish': 'unpublish', 'export': 'export', 'suspend': 'suspend', 'unsuspend': 'unsuspend',
    'restore': 'restore', 'logout': 'logout', 'change-password': 'password_change',
    'update-role': 'config_change', 'add-shares': 'config_change', 'renew-shares': 'config_change',
    'reset-password': 'password_reset', 'resolve': 'resolve', 'assign': 'assign',
}
METHOD_ACTIONS = {'POST': 'create', 'PUT': 'update', 'PATCH': 'update', 'DELETE': 'delete'}
ACTION_PAST = {
    'create': 'created', 'update': 'updated', 'delete': 'deleted', 'approve': 'approved',
    'reject': 'rejected', 'send': 'sent', 'publish': 'published', 'unpublish': 'unpublished',
    'export': 'exported', 'suspend': 'suspended', 'unsuspend': 'unsuspended', 'restore': 'restored',
    'logout': 'signed out', 'login': 'signed in', 'login_failed': 'failed to sign in',
    'password_change': 'changed their password', 'password_reset': 'reset a password',
    'config_change': 'changed settings of', 'view_sensitive': 'viewed sensitive data in',
    'resolve': 'resolved', 'assign': 'assigned',
}

_ID_SEGMENT = re.compile(r'^(?:\d+|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|[0-9a-fA-F]{24,})$')


# ---------------------------------------------------------------- helpers

def is_executive_role(role) -> bool:
    return str(role or '').strip().upper() in EXECUTIVE_ROLES


def department_label(role) -> str:
    role = str(role or '').strip().upper()
    return DEPARTMENT_LABELS.get(role, role.replace('_', ' ').title())


def module_for_path(path: str) -> str:
    """Executive module key for a request path, 'general' when none matches."""
    rel = path[len(API_PREFIX):] if path.startswith(API_PREFIX) else path.lstrip('/')
    rel = rel.strip('/')
    for prefix, module in _PREFIXES_SORTED:
        if rel == prefix or rel.startswith(prefix + '/'):
            return module
    return 'general'


def _segments(path: str):
    rel = path[len(API_PREFIX):] if path.startswith(API_PREFIX) else path.lstrip('/')
    return [s for s in rel.strip('/').split('/') if s]


def _actor_name(user) -> str:
    for attr in ('name', 'get_full_name'):
        value = getattr(user, attr, None)
        value = value() if callable(value) else value
        if value:
            return str(value)[:255]
    return str(getattr(user, 'matricule', '') or getattr(user, 'email', '') or user.pk)[:255]


def outcome_for_status(status_code) -> str:
    code = int(status_code or 0)
    if code in (401, 403):
        return ExecutiveActivityLog.Outcome.DENIED
    if code >= 500:
        return ExecutiveActivityLog.Outcome.ERROR
    if code >= 400:
        return ExecutiveActivityLog.Outcome.FAILED
    return ExecutiveActivityLog.Outcome.SUCCESS


def _resource_noun(segments, module):
    words = [s for s in segments if not _ID_SEGMENT.match(s)]
    if len(words) >= 2 and words[0] in {'platform', 'users', 'schools', 'registry', 'community'}:
        noun = words[1]
    elif words:
        noun = words[0]
    else:
        noun = module
    return noun.replace('-', ' ').replace('_', ' ')


def classify_request(method: str, path: str, view_actions=None):
    """Return (action, module, target_type, target_id, noun) for a request."""
    segments = _segments(path)
    module = module_for_path(path)
    action = None
    if view_actions:
        name = view_actions.get(method.lower())
        if name and name not in {'list', 'retrieve', 'create', 'update', 'partial_update', 'destroy'}:
            action = PATH_ACTIONS.get(name.replace('_', '-')) or name[:48]
    if action is None and segments:
        action = PATH_ACTIONS.get(segments[-1])
    if action is None and method in SAFE_METHODS:
        action = 'export' if re.search(r'export|download', path, re.I) else 'view_sensitive'
    if action is None:
        action = METHOD_ACTIONS.get(method, method.lower())
    ids = [s for s in segments if _ID_SEGMENT.match(s)]
    noun = _resource_noun(segments, module)
    target_id = ids[-1][:64] if ids else ''
    target_type = noun[:64]
    return action, module, target_type, target_id, noun


def build_summary(actor_name, role, action, module, noun, target_label='', outcome='success'):
    dept = department_label(role)
    verb = ACTION_PAST.get(action, action.replace('_', ' '))
    module_label = MODULE_LABELS.get(module, module.replace('_', ' ').title())
    subject = f'{noun}' if noun else module_label
    if action in ('login', 'logout', 'login_failed', 'password_change'):
        text = f'{dept}: {actor_name} {verb}'
    else:
        text = f'{dept}: {actor_name} {verb} {subject}'
        if target_label:
            text += f' "{target_label}"'
    if outcome == 'denied':
        text += ' - denied (no access)'
    elif outcome in ('failed', 'error'):
        text += ' - did not complete'
    return text[:500]


def _clip(value, size):
    return str(value or '')[:size]


# ---------------------------------------------------------------- recording

def record_executive_activity(*, user=None, request=None, action, module='general', target_type='',
                              target_id='', target_label='', summary='', outcome=None,
                              status_code=None, method=None, path=None, actor_name=None,
                              actor_role=None):
    """Append one entry. Never raises; returns the row or None."""
    try:
        meta = getattr(request, 'META', {}) if request is not None else {}
        if method is None and request is not None:
            method = getattr(request, 'method', '')
        if path is None and request is not None:
            path = getattr(request, 'path', '')
        role = actor_role if actor_role is not None else str(getattr(user, 'role', '') or '')
        name = actor_name if actor_name is not None else (_actor_name(user) if user is not None else '')
        if outcome is None:
            outcome = outcome_for_status(status_code) if status_code else ExecutiveActivityLog.Outcome.SUCCESS
        request_id = (meta.get('HTTP_X_REQUEST_ID') or '')[:64] if meta else ''
        if not request_id and request is not None:
            request_id = getattr(request, '_exec_request_id', '') or uuid.uuid4().hex
        if not summary:
            summary = build_summary(name, role, action, module, target_type, target_label, outcome)
        actor = user if (user is not None and getattr(user, 'pk', None)) else None
        with transaction.atomic():
            return ExecutiveActivityLog.objects.create(
                actor=actor,
                actor_role=_clip(role, 32),
                actor_name=_clip(name, 255),
                module=_clip(module, 64),
                action=_clip(action, 48),
                target_type=_clip(target_type, 64),
                target_id=_clip(target_id, 64),
                target_label=_clip(target_label, 255),
                summary=_clip(summary, 500),
                outcome=outcome,
                method=_clip(method, 10),
                path=_clip(path, 300),
                status_code=status_code,
                ip_address=_clip(get_client_ip(request) if request is not None else '', 64),
                user_agent=_clip(meta.get('HTTP_USER_AGENT', '') if meta else '', 255),
                request_id=request_id,
            )
    except Exception:  # noqa: BLE001 - logging must never break the request
        logger.exception('Executive activity log write failed')
        return None


def record_login(request, user, *, success=True, reason=''):
    """Called by the sign-in view. Only executive accounts are recorded."""
    try:
        if not is_executive_role(getattr(user, 'role', '')):
            return None
        action = 'login' if success else 'login_failed'
        summary = build_summary(_actor_name(user), user.role, action, 'authentication', '', '', 'success')
        if not success and reason:
            summary = f'{summary} ({reason})'[:500]
        return record_executive_activity(
            user=user, request=request, action=action, module='authentication',
            summary=summary, outcome='success' if success else 'failed',
            status_code=200 if success else 401, method='POST', path='/api/v1/auth/login/',
        )
    except Exception:  # noqa: BLE001
        logger.exception('Executive login log failed')
        return None


def prune_before(cutoff):
    """Retention helper for ``prune_executive_activity``. Returns rows deleted."""
    qs = ExecutiveActivityLog.objects.filter(created_at__lt=cutoff)
    return qs._raw_delete(qs.db)


# ---------------------------------------------------------------- middleware

_FOUNDER_UPDATE_RE = re.compile(r'^/api/v1/users/founders/[^/]+/?$')


class ExecutiveActivityMiddleware:
    """Records executive writes and sensitive reads after the response."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        note = None
        try:
            if (request.method == 'PATCH' and _FOUNDER_UPDATE_RE.match(request.path)
                    and 'json' in (request.content_type or '')
                    and int(request.META.get('CONTENT_LENGTH') or 0) < 65536):
                note = self._module_assignment_note(request)
        except Exception:  # noqa: BLE001
            note = None
        response = self.get_response(request)
        try:
            self._record(request, response, note)
        except Exception:  # noqa: BLE001
            logger.exception('Executive activity middleware failed')
        return response

    @staticmethod
    def _module_assignment_note(request):
        """Keys only (no free text): which assignment fields the founder sent."""
        payload = json.loads(request.body or b'{}')
        if not isinstance(payload, dict):
            return None
        note = {}
        if 'allowed_modules' in payload and isinstance(payload['allowed_modules'], list):
            note['modules'] = [str(m)[:40] for m in payload['allowed_modules'][:40]]
        sensitive = {'password', 'new_password', 'token'}
        note['fields'] = sorted(k for k in payload if k not in sensitive)[:20]
        return note

    def _record(self, request, response, note):
        path = request.path
        if not path.startswith(API_PREFIX):
            return
        user = getattr(request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return
        if not is_executive_role(getattr(user, 'role', '')):
            return
        method = request.method
        rel = path[len(API_PREFIX):]
        if any(rel.startswith(p) for p in SKIP_PREFIXES):
            return
        status_code = getattr(response, 'status_code', None)
        if method in SAFE_METHODS:
            wants_export = (request.GET.get('format') or request.GET.get('export') or '').lower() in EXPORT_FORMATS | {'1', 'true'}
            if method != 'GET' or not (SENSITIVE_READ_RE.search(path) or wants_export):
                return
            if status_code and status_code >= 400 and outcome_for_status(status_code) != 'denied':
                return
        view_actions = getattr(getattr(request, 'resolver_match', None), 'func', None)
        view_actions = getattr(view_actions, 'actions', None)
        action, module, target_type, target_id, noun = classify_request(method, path, view_actions)
        if module == 'authentication' and action not in ('logout', 'password_change'):
            return
        if module == 'executive_activity':
            return  # the export view records itself; plain reads are not logged
        if module == 'authentication':
            noun = ''
        outcome = outcome_for_status(status_code)
        target_label = ''
        summary_extra = ''
        if note and outcome == 'success':
            action = 'config_change' if note.get('modules') is not None else action
            if note.get('modules') is not None:
                summary_extra = 'module access set to: ' + (', '.join(note['modules']) or 'none')
                noun = 'executive module assignment'
                module = 'founders'
        name = _actor_name(user)
        summary = build_summary(name, user.role, action, module, noun, target_label, outcome)
        if summary_extra:
            summary = f'{summary} ({summary_extra})'[:500]
        record_executive_activity(
            user=user, request=request, action=action, module=module, target_type=target_type,
            target_id=target_id, target_label=target_label, summary=summary, outcome=outcome,
            status_code=status_code,
        )


def day_bounds_utc(days_back: int = 0):
    """Start of the Douala day ``days_back`` days ago, as an aware datetime."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(DISPLAY_TIMEZONE)
    now = timezone.now().astimezone(tz)
    start = (now - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start
