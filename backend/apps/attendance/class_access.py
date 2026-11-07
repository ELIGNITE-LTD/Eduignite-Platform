"""Who may take the register of a class.

Every attendance permission check that depends on "is this teacher responsible
for that class" goes through this module, so the rule lives in one place.

PLUG-IN POINT for class-teacher assignment: ``teacher_class_ids`` is the only
function that decides which classes a teacher may act on. Today it returns the
classes the teacher is class master of, plus the classes they teach a subject
in (``ClassSubject.teacher``). When ``schools.ClassTeacherAssignment`` lands,
add its classes to the set returned there; nothing else has to change.
"""

from __future__ import annotations

from apps.schools.scoping import managed_sub_school_ids

ADMIN_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN')


def teacher_class_ids(user) -> set:
    """Ids of the classes (in the teacher's own school) this teacher may act on."""
    from apps.grades.models import ClassSubject
    from apps.schools.models import SchoolClass

    if getattr(user, 'role', None) != 'TEACHER' or not getattr(user, 'school_id', None):
        return set()
    ids = set(
        SchoolClass.objects.filter(school_id=user.school_id, class_master=user)
        .values_list('id', flat=True)
    )
    ids.update(
        ClassSubject.objects.filter(teacher=user, school_class__school_id=user.school_id)
        .values_list('school_class_id', flat=True)
    )
    # Class-centred teaching: in Basic Education schools a teacher assigned to a
    # class (schools.ClassTeacherAssignment) may take its register. This helper
    # returns nothing for non-basic schools, so their behaviour is unchanged.
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    ids.update(basic_class_ids_for_teacher(user))
    return ids


def can_take_register(user, school_class) -> bool:
    """May this user take (or correct) the register of ``school_class``?"""
    if school_class is None or not getattr(user, 'school_id', None):
        return False
    if school_class.school_id != user.school_id:
        return False
    role = getattr(user, 'role', None)
    if role in ADMIN_ROLES:
        managed = managed_sub_school_ids(user)
        return managed is None or school_class.sub_school_id in managed
    if role == 'TEACHER':
        return school_class.id in teacher_class_ids(user)
    return False
