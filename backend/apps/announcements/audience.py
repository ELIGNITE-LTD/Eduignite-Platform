"""Who may address an announcement to whom, and who receives it.

This module is the single source of truth for the announcement permission
model. The API (creation rules and the feed), the notification fan-out and
the data migration that repaired older announcements all read it, so the
feed a person sees and the notifications they receive cannot disagree.

Two kinds of announcement exist:

* Platform announcements (``school`` is empty) are written by EduIgnite
  executives. The CEO may address any platform audience. Every other
  executive is limited to the executive audience, unless the CEO has granted
  them another audience explicitly (``AnnouncementAudienceGrant``).
* School announcements (``school`` is set) are written by a school's own
  staff and never leave that school.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.users.executive_access import user_has_module
from apps.users.role_groups import (
    EXECUTIVE_ROLES,
    PRINCIPAL_ROLES,
    SCHOOL_ROLES,
    normalized_role,
    parents_of_school_q,
    school_ids_for_user,
)

# Platform audiences.
EXECUTIVE = 'EXECUTIVE'
ALL_SCHOOL_USERS = 'ALL_SCHOOL_USERS'
ALL_EDUIGNITE_USERS = 'ALL_EDUIGNITE_USERS'
PRINCIPAL = 'PRINCIPAL'
PARENT = 'PARENT'

PLATFORM_AUDIENCES = (EXECUTIVE, ALL_SCHOOL_USERS, ALL_EDUIGNITE_USERS, PRINCIPAL, PARENT)
GRANTABLE_AUDIENCES = (ALL_SCHOOL_USERS, ALL_EDUIGNITE_USERS, PRINCIPAL, PARENT)

PLATFORM_AUDIENCE_LABELS = {
    EXECUTIVE: 'Executive',
    ALL_SCHOOL_USERS: 'All School Users',
    ALL_EDUIGNITE_USERS: 'All EduIgnite Users',
    PRINCIPAL: 'Principal',
    PARENT: 'Parent',
}

# School audiences. ``ALL`` and ``SCHOOL_ALL`` both mean "everyone at this
# school"; both spellings exist in stored data, so both stay valid.
SCHOOL_WIDE_TARGETS = ('ALL', 'SCHOOL_ALL')
SCHOOL_ADMIN_TARGETS = ('SCHOOL_ALL', 'ALL', 'TEACHER', 'STUDENT', 'PARENT', 'BURSAR', 'LIBRARIAN', 'PERSONAL')
SCHOOL_STAFF_TARGETS = ('SCHOOL_ALL', 'ALL', 'STUDENT')
SCHOOL_TARGET_ROLES = {
    'TEACHER': ('TEACHER',),
    'STUDENT': ('STUDENT',),
    'PARENT': ('PARENT',),
    'BURSAR': ('BURSAR',),
    'LIBRARIAN': ('LIBRARIAN',),
}

# Roles allowed to write announcements at all.
SCHOOL_SENDER_ROLES = PRINCIPAL_ROLES | {'TEACHER', 'BURSAR'}


def granted_audiences(user) -> set:
    from .models import AnnouncementAudienceGrant

    return set(
        AnnouncementAudienceGrant.objects.filter(user=user).values_list('audience', flat=True)
    )


def allowed_targets_for(user) -> list:
    """Every target this person may choose, in display order."""
    role = normalized_role(user)
    if role == 'CEO':
        return list(PLATFORM_AUDIENCES)
    if role in EXECUTIVE_ROLES:
        # Writing announcements is an assignable executive module.
        if not user_has_module(user, 'announcements'):
            return []
        granted = granted_audiences(user)
        return [EXECUTIVE] + [a for a in GRANTABLE_AUDIENCES if a in granted]
    if role in PRINCIPAL_ROLES and getattr(user, 'school_id', None):
        return list(SCHOOL_ADMIN_TARGETS)
    if role in SCHOOL_SENDER_ROLES and getattr(user, 'school_id', None):
        return list(SCHOOL_STAFF_TARGETS)
    return []


def can_write_announcements(user) -> bool:
    return bool(allowed_targets_for(user))


def is_platform_sender(user) -> bool:
    return normalized_role(user) in EXECUTIVE_ROLES


def can_choose_target_school(user) -> bool:
    """Only a sender who may address parents platform-wide may narrow to one school."""
    return PARENT in allowed_targets_for(user) and is_platform_sender(user)


def visible_announcements_q(user) -> Q:
    """Announcements this person may see in their feed.

    A sender always sees what they sent. Everything else is decided by the
    announcement's audience and the viewer's role and school.
    """
    role = normalized_role(user)
    visible = Q(sender_id=user.pk)

    if role in EXECUTIVE_ROLES:
        return visible | Q(school__isnull=True, target__in=[EXECUTIVE, ALL_EDUIGNITE_USERS])

    if role not in SCHOOL_ROLES:
        return visible

    platform = Q(target__in=[ALL_SCHOOL_USERS, ALL_EDUIGNITE_USERS])
    if role in PRINCIPAL_ROLES:
        platform |= Q(target=PRINCIPAL)
    if role == 'PARENT':
        parent_scope = Q(target_school__isnull=True)
        school_ids = school_ids_for_user(user)
        if school_ids:
            parent_scope |= Q(target_school_id__in=school_ids)
        platform |= Q(target=PARENT) & parent_scope
    visible |= Q(school__isnull=True) & platform

    if user.school_id:
        if role in PRINCIPAL_ROLES:
            visible |= Q(school_id=user.school_id)
        else:
            visible |= Q(school_id=user.school_id) & (
                Q(target__in=SCHOOL_WIDE_TARGETS)
                | Q(target=role)
                | Q(target='PERSONAL', target_user_id=user.pk)
            )
    return visible


def recipients_for_announcement(announcement):
    """Active users who should be notified about this announcement."""
    User = get_user_model()
    people = User.objects.filter(is_active=True, is_drafted=False)
    target = announcement.target

    if announcement.school_id is None:
        if target == EXECUTIVE:
            recipients = people.filter(role__in=EXECUTIVE_ROLES)
        elif target == ALL_SCHOOL_USERS:
            recipients = people.filter(role__in=SCHOOL_ROLES)
        elif target == ALL_EDUIGNITE_USERS:
            recipients = people.filter(role__in=EXECUTIVE_ROLES | SCHOOL_ROLES)
        elif target == PRINCIPAL:
            recipients = people.filter(role__in=PRINCIPAL_ROLES)
        elif target == PARENT:
            recipients = people.filter(role='PARENT')
            if announcement.target_school_id:
                recipients = recipients.filter(parents_of_school_q(announcement.target_school_id))
        else:
            # An unrecognised platform audience reaches the smallest group.
            recipients = people.filter(role__in=EXECUTIVE_ROLES)
    else:
        members = people.filter(school_id=announcement.school_id)
        if target in SCHOOL_WIDE_TARGETS:
            recipients = members.filter(role__in=SCHOOL_ROLES)
        elif target == 'PERSONAL':
            recipients = members.filter(pk=announcement.target_user_id)
        elif target == 'PARENT':
            recipients = people.filter(role='PARENT').filter(parents_of_school_q(announcement.school_id))
        elif target in SCHOOL_TARGET_ROLES:
            recipients = members.filter(role__in=SCHOOL_TARGET_ROLES[target])
        else:
            recipients = members.none()

    return recipients.exclude(pk=announcement.sender_id).distinct()


def can_manage_announcement(user, announcement) -> bool:
    """Edit and delete rights: the sender, a principal for their own school's
    announcements, or the CEO for platform announcements."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    role = normalized_role(user)
    if role in EXECUTIVE_ROLES and not user_has_module(user, 'announcements'):
        return False
    if announcement.sender_id == user.pk:
        return True
    if announcement.school_id is None:
        return role == 'CEO'
    return role in PRINCIPAL_ROLES and announcement.school_id == getattr(user, 'school_id', None)
