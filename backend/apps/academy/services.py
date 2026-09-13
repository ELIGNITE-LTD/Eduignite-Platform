"""Small shared helpers used across ``apps.academy`` views.

Kept out of views.py so the audit-logging and deep-link-expiry rules (both
explicit, named security/business requirements in the spec) live in exactly
one place instead of being re-implemented per-endpoint.
"""

import re
from datetime import timedelta

from django.utils import timezone

from .models import AcademyAuditLog, AcademyProfile, DeepLinkCache

DEEP_LINK_TTL = timedelta(minutes=30)

# Matches sync_trainer_profile()'s own auto-generated bio text exactly, so
# it can tell "still auto-generated, safe to refresh" apart from "a human
# has since written real biographical copy over it, leave it alone" without
# needing an extra model field to track which case it is.
_AUTO_BIO_PATTERN = re.compile(r'^.+ at EduIgnite Academy — \d+ published courses?\.$')

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


def sync_trainer_profile(user):
    """Get-or-create ``user``'s TrainerProfile and refresh the fields that
    have a real, always-current automatic source, so a course author is
    never blocked on someone hand-typing them into the CMS first (product
    requirement: "Trainers profile and bio manager should be built
    automatically and update by the system").

    - ``photo_url`` is always overwritten from ``user.avatar`` — there is
      exactly one true source for a user's photo on this platform, so
      there is no "manual override" to protect here.
    - ``bio`` is auto-generated from real facts (role + published course
      count) and kept in sync on every call — but ONLY for as long as it
      still looks auto-generated (matches ``_AUTO_BIO_PATTERN`` below). The
      moment a human writes real biographical copy over it via the CMS, it
      stops matching that pattern and this function leaves it alone
      forever after — a deliberate edit is never clobbered.
    - ``credentials`` and ``is_verified`` are untouched: there is no
      automatic source for certifications, and public-listing verification
      is a deliberate trust gate a PROFILE_EDIT holder grants by hand.

    Call this whenever a user's authorship of Academy content changes
    (currently: on course creation) — see ``CourseViewSet.perform_create``.
    """
    from .models import Course, TrainerProfile

    trainer_profile, _ = TrainerProfile.objects.get_or_create(user=user)
    update_fields = []

    if trainer_profile.photo_url != user.avatar:
        trainer_profile.photo_url = user.avatar
        update_fields.append('photo_url')

    if not trainer_profile.bio or _AUTO_BIO_PATTERN.match(trainer_profile.bio):
        published_count = Course.objects.filter(created_by=user, status=Course.Status.PUBLISHED).count()
        role_label = user.get_role_display() if hasattr(user, 'get_role_display') else ''
        course_word = 'course' if published_count == 1 else 'courses'
        subject = role_label if role_label else 'EduIgnite Academy trainer'
        new_bio = f'{subject} at EduIgnite Academy — {published_count} published {course_word}.'
        if new_bio != trainer_profile.bio:
            trainer_profile.bio = new_bio
            update_fields.append('bio')

    if update_fields:
        trainer_profile.save(update_fields=[*update_fields, 'updated_at'])
    return trainer_profile


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
