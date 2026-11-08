"""Display labels for roles, where the label depends on the school.

The stored role keys never change. Only the words shown to people do:

* SCHOOL_ADMIN of a secondary school  -> "Principal"
* SCHOOL_ADMIN of a basic (nursery / primary) school -> "Discipline Master"
* SCHOOL_ADMIN of a higher-education school (or with no school) keeps the
  model's own label ("School Administrator").

Use ``role_display(user)`` wherever the backend prints a role name to a human
(emails, PDFs, serializers) instead of ``get_role_display()``.
"""

PRINCIPAL_LABEL = 'Principal'
DISCIPLINE_MASTER_LABEL = 'Discipline Master'


def school_admin_label(education_category) -> str | None:
    """Label of a SCHOOL_ADMIN for a school's education category, or None to keep the default."""
    category = str(education_category or '').lower()
    if category == 'secondary':
        return PRINCIPAL_LABEL
    if category == 'basic':
        return DISCIPLINE_MASTER_LABEL
    return None


def role_display(user) -> str:
    """Human-readable role of ``user``, aware of their school's education category."""
    default = user.get_role_display() if hasattr(user, 'get_role_display') else str(getattr(user, 'role', '') or '')
    if str(getattr(user, 'role', '') or '').upper() != 'SCHOOL_ADMIN':
        return default
    school = getattr(user, 'school', None) if getattr(user, 'school_id', None) else None
    return school_admin_label(getattr(school, 'education_category', None)) or default
