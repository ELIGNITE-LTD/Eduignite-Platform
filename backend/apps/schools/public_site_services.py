"""Publication rules, text cleaning and audit trail for the school public site."""

import hmac
import re
import secrets

from django.utils import timezone
from django.utils.html import strip_tags

from .models import PublicationStatus, PublicSiteAuditLog, SchoolPublicProfile, SchoolStatus

TEXT_FIELDS = [
    'vision', 'mission', 'history', 'hero_title', 'hero_subtitle',
    'cta_primary_label', 'cta_secondary_label', 'meta_title', 'meta_description',
]
LANGS = ('en', 'fr')
BILINGUAL_FIELDS = [f'{f}_{lang}' for f in TEXT_FIELDS for lang in LANGS]
SOCIAL_KEYS = {'facebook', 'twitter', 'x', 'instagram', 'youtube', 'linkedin', 'tiktok', 'whatsapp', 'website'}
_CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
_HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def clean_text(value):
    """Plain text only: tags removed, control characters dropped. No rich text yet.

    django.utils.html.strip_tags is used because no HTML sanitiser (nh3/bleach) is
    in requirements. Output is stored as plain text and must be escaped on render.
    """
    if value is None:
        return ''
    text = _CONTROL.sub('', strip_tags(str(value)))
    return text.replace('<', '').replace('>', '').strip()


def valid_hex_color(value):
    return not value or bool(_HEX.match(value))


def get_profile(school):
    profile, _ = SchoolPublicProfile.objects.get_or_create(school=school)
    return profile


def is_live(school):
    """School itself is eligible to be public (not drafted/pending/suspended, has a slug)."""
    return (school.status == SchoolStatus.ACTIVE and not school.is_drafted
            and bool(school.public_slug) and school.public_profile_enabled)


def publish_errors(school):
    """Minimum content to go public. Returns {field: message}."""
    errors = {}
    if not (school.name or '').strip():
        errors['name'] = 'The school name is required.'
    if not (school.description or '').strip():
        errors['description'] = 'Add a short description of the school before publishing.'
    if not ((school.email or '').strip() or (school.phone or '').strip()):
        errors['contact'] = 'Add at least one contact method (email or phone) before publishing.'
    if school.status != SchoolStatus.ACTIVE or school.is_drafted:
        errors['school'] = 'The school account must be active before its site can be published.'
    if not school.public_profile_enabled:
        errors['public_profile_enabled'] = 'Public pages are disabled for this school by the platform.'
    if not school.public_slug:
        errors['slug'] = 'The school has no public address yet.'
    return errors


def preview_token_matches(profile, supplied):
    token = profile.preview_token
    return bool(token and supplied and hmac.compare_digest(token.encode(), str(supplied).encode()))


def new_preview_token():
    return secrets.token_urlsafe(24)


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip() or None
    return request.META.get('REMOTE_ADDR') or None


def _summary(value):
    if isinstance(value, (dict, list)):
        value = repr(value)
    text = '' if value is None else str(value)
    return text if len(text) <= 120 else text[:117] + '...'


def diff_fields(before: dict, after: dict):
    return {k: {'before': _summary(before.get(k)), 'after': _summary(after[k])}
            for k in after if before.get(k) != after[k]}


def snapshot(profile, fields):
    return {f: getattr(profile, f) for f in fields}


def write_audit(school, request, action, changes=None):
    user = getattr(request, 'user', None)
    authed = bool(user and user.is_authenticated)
    return PublicSiteAuditLog.objects.create(
        school=school,
        actor=user if authed else None,
        actor_name=(getattr(user, 'name', '') or str(user))[:200] if authed else '',
        action=action,
        changes=changes or {},
        ip_address=client_ip(request),
    )


def set_status(profile, status, request, action, user=None):
    before = profile.publication_status
    profile.publication_status = status
    if status == PublicationStatus.PUBLISHED:
        profile.published_at = timezone.now()
    profile.updated_by = user
    profile.save()
    write_audit(profile.school, request, action,
                {'publication_status': {'before': before, 'after': status}})
    return profile
