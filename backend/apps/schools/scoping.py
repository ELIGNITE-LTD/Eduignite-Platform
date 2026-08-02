"""Sub-school scoping for vice principals / sub-administrators.

A principal (``SCHOOL_ADMIN``) and the platform executives run the whole
school. A vice principal / sub-administrator (``SUB_ADMIN``) is deliberately
narrower: they do everything a principal does, but only inside the
sub-school(s) they have been assigned to. These helpers turn a user into the
set of sub-schools they may act on, so every list, edit and delete can be
filtered the same way.
"""

from django.db.models import Q


def managed_sub_school_ids(user):
    """The sub-school ids a user administers, or ``None`` for the whole school.

    ``None`` means "no sub-school restriction" — the caller should not filter.
    A set (possibly empty) means the caller must restrict to exactly those
    sub-schools. A ``SUB_ADMIN`` with no assignment therefore manages nothing
    beyond their own account, which is the intended safe default.
    """
    role = str(getattr(user, 'role', '') or '')
    if getattr(user, 'is_platform_executive', False) or role == 'SCHOOL_ADMIN':
        return None
    if role == 'SUB_ADMIN':
        # Imported here to avoid a circular import at module load.
        from apps.schools.models import SubSchool

        ids = set()
        if getattr(user, 'sub_school_id', None):
            ids.add(user.sub_school_id)
        ids.update(
            SubSchool.objects.filter(vice_principal=user).values_list('id', flat=True)
        )
        return ids
    return None


def scope_users_to_sub_schools(queryset, ids):
    """Restrict a ``User`` queryset to staff or students of the given sub-schools.

    Staff carry ``sub_school`` directly; a student's sub-school comes from
    their class (``student_profile.school_class.sub_school``). Either match
    keeps the row. ``ids is None`` means no restriction.
    """
    if ids is None:
        return queryset
    return queryset.filter(
        Q(sub_school_id__in=ids)
        | Q(student_profile__school_class__sub_school_id__in=ids)
    ).distinct()
