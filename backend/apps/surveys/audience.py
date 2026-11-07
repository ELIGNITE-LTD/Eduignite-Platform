"""Who may publish surveys, and who is asked to answer each one.

Every survey endpoint filters through these functions, so an ineligible
person can neither list, open nor answer a survey, whatever the client shows.
"""

from django.db.models import Q

from apps.users.executive_access import user_has_module
from apps.users.role_groups import (
    EXECUTIVE_ROLES,
    FOUNDER_ROLES,
    PRINCIPAL_ROLES,
    SCHOOL_ROLES,
    SCHOOL_STAFF_ROLES,
    normalized_role,
    school_ids_for_user,
)

from .models import SurveyAudience, SurveyPublisher

SCHOOL_AUDIENCES = frozenset({
    SurveyAudience.ALL_SCHOOL_USERS,
    SurveyAudience.PRINCIPAL,
    SurveyAudience.SCHOOL_STAFF,
    SurveyAudience.TEACHER,
    SurveyAudience.STUDENT,
    SurveyAudience.PARENT,
})


def is_founder(user) -> bool:
    return normalized_role(user) in FOUNDER_ROLES


def can_publish(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return (
        is_founder(user)
        or has_surveys_module(user)
        or SurveyPublisher.objects.filter(user=user).exists()
    )


def has_surveys_module(user) -> bool:
    """An executive given the ``surveys`` module (founders always have it)."""
    return normalized_role(user) in EXECUTIVE_ROLES and user_has_module(user, 'surveys')


def manageable_surveys_q(user) -> Q:
    """Founders and executives holding the surveys module manage every survey;
    an authorised publisher manages their own."""
    if is_founder(user) or has_surveys_module(user):
        return Q()
    if can_publish(user):
        return Q(created_by_id=user.pk)
    return Q(pk__in=[])


def eligible_surveys_q(user) -> Q:
    """Surveys this person is in the audience for."""
    role = normalized_role(user)
    if role in EXECUTIVE_ROLES:
        return Q(audience__in=[SurveyAudience.ALL_EDUIGNITE_USERS, SurveyAudience.EXECUTIVE])
    if role not in SCHOOL_ROLES:
        return Q(pk__in=[])

    audiences = [SurveyAudience.ALL_SCHOOL_USERS]
    if role in PRINCIPAL_ROLES:
        audiences.append(SurveyAudience.PRINCIPAL)
    if role in SCHOOL_STAFF_ROLES:
        audiences.append(SurveyAudience.SCHOOL_STAFF)
    if role in (SurveyAudience.TEACHER, SurveyAudience.STUDENT, SurveyAudience.PARENT):
        audiences.append(role)

    in_school = Q(target_school__isnull=True)
    school_ids = school_ids_for_user(user)
    if school_ids:
        in_school |= Q(target_school_id__in=school_ids)
    return Q(audience=SurveyAudience.ALL_EDUIGNITE_USERS) | (Q(audience__in=audiences) & in_school)
