"""Class-centred teaching access for Basic Education schools.

Workflow: Teacher -> Assigned Class -> Configured Subjects -> Learners.
In a school whose ``education_category`` is ``basic`` a teacher assigned to a
class (``ClassTeacherAssignment``) or set as its ``class_master`` can work with
every configured ``ClassSubject`` of that class without a per-subject teacher.
For every other school these helpers return nothing, so subject-specific
assignment (``ClassSubject.teacher``) is unchanged.
"""

BASIC = 'basic'


def is_basic_school(school):
    return bool(school) and getattr(school, 'education_category', None) == BASIC


def basic_class_ids_for_teacher(user):
    """Ids of classes a teacher teaches as a whole class (basic schools only)."""
    if getattr(user, 'role', None) != 'TEACHER' or not getattr(user, 'school_id', None):
        return set()
    if not is_basic_school(getattr(user, 'school', None)):
        return set()

    from .models import ClassTeacherAssignment, SchoolClass

    ids = set(
        ClassTeacherAssignment.objects.filter(
            teacher=user,
            school_class__school_id=user.school_id,
        ).values_list('school_class_id', flat=True)
    )
    ids.update(
        SchoolClass.objects.filter(class_master=user, school_id=user.school_id).values_list('id', flat=True)
    )
    return ids


def teacher_teaches_class_as_whole(user, school_class):
    """True when ``user`` is a class-level teacher of ``school_class`` in a basic school."""
    if school_class is None:
        return False
    if school_class.school_id != getattr(user, 'school_id', None):
        return False
    return school_class.id in basic_class_ids_for_teacher(user)
