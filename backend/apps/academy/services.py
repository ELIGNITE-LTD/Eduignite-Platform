"""Small shared helpers used across ``apps.academy`` views.

Kept out of views.py so the audit-logging and deep-link-expiry rules (both
explicit, named security/business requirements in the spec) live in exactly
one place instead of being re-implemented per-endpoint.
"""

from datetime import timedelta

from django.utils import timezone

from .models import AcademyAuditLog, AcademyProfile, DeepLinkCache

DEEP_LINK_TTL = timedelta(minutes=30)

# Simple role -> Academy course-pathway lookup used by the SSO handshake to
# "sync role-based course recommendations" (contract: "a simple role-to-
# course-pathway lookup, not a recommendation engine").
ROLE_TO_COURSE_PATHWAY = {
    'SCHOOL_ADMIN': 'PRINCIPAL',
    'SUB_ADMIN': 'PRINCIPAL',
    'TEACHER': 'TEACHER',
    'BURSAR': 'ACCOUNTANT',
    'LIBRARIAN': 'LIBRARIAN',
}


def ensure_academy_profile(user):
    """Get-or-create the caller's AcademyProfile. Every User does NOT get one
    up front — only lazily, the first time they touch an Academy endpoint."""
    profile, _ = AcademyProfile.objects.get_or_create(user=user)
    return profile


def recommended_course_slugs_for_role(role):
    from .models import Course

    pathway = ROLE_TO_COURSE_PATHWAY.get(role)
    if not pathway:
        return []
    return list(
        Course.objects.filter(status=Course.Status.PUBLISHED, role_pathway=pathway)
        .order_by('-is_featured', '-created_at')
        .values_list('slug', flat=True)
    )


def log_academy_action(request, *, action, entity, user=None):
    """Write one AcademyAuditLog row. ``user`` defaults to the requester;
    pass an explicit value (or None) for system actions."""
    actor = user if user is not None else getattr(request, 'user', None)
    if actor is not None and not getattr(actor, 'is_authenticated', True):
        actor = None
    AcademyAuditLog.objects.create(
        user=actor,
        action=action,
        entity=entity,
        ip_address=_client_ip(request),
        user_agent=(request.META.get('HTTP_USER_AGENT', '') if request else '')[:2000],
    )


def _client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def get_active_deep_link(state):
    """Return the DeepLinkCache row for ``state`` if it exists and is not
    older than 30 minutes, else None. Expiry is enforced purely by filtering
    at read time — no cron/cleanup job needed."""
    if not state:
        return None
    cutoff = timezone.now() - DEEP_LINK_TTL
    return DeepLinkCache.objects.filter(state=state, created_at__gte=cutoff).first()
