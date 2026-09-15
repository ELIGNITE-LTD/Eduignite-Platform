"""Role groupings shared by every feature that addresses people as an audience.

Announcements, surveys and notifications all need the same answer to "who is
an executive?", "who is a school user?" and "who are this school's parents?".
Keeping those answers here, in the users app every feature already depends
on, means the features agree with each other without importing one another.
"""

from django.db.models import Q

EXECUTIVE_ROLES = frozenset({'SUPER_ADMIN', 'CEO', 'CTO', 'COO', 'INV', 'DESIGNER'})
FOUNDER_ROLES = frozenset({'CEO', 'CTO'})
PRINCIPAL_ROLES = frozenset({'SCHOOL_ADMIN', 'SUB_ADMIN'})
SCHOOL_STAFF_ROLES = frozenset({'SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'})
SCHOOL_ROLES = SCHOOL_STAFF_ROLES | frozenset({'STUDENT', 'PARENT'})


def normalized_role(user) -> str:
    return str(getattr(user, 'role', '') or '').strip().upper()


def parents_of_school_q(school_id) -> Q:
    """Users (filter with role PARENT) who belong to a school directly or
    through a child enrolled there."""
    return (
        Q(school_id=school_id)
        | Q(linked_students__student__school_id=school_id)
        | Q(guardian_profile__student_links__student__school_id=school_id)
    )


def school_ids_for_user(user) -> set:
    """Every school a person belongs to. A parent also belongs to each school
    one of their children attends."""
    school_ids = set()
    if getattr(user, 'school_id', None):
        school_ids.add(user.school_id)
    if normalized_role(user) == 'PARENT':
        from apps.students.models import ParentStudentLink, StudentGuardian

        school_ids.update(
            ParentStudentLink.objects.filter(parent=user).values_list('student__school_id', flat=True)
        )
        school_ids.update(
            StudentGuardian.objects.filter(guardian__user=user).values_list('student__school_id', flat=True)
        )
    school_ids.discard(None)
    return school_ids
