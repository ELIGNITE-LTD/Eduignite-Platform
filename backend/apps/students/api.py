"""Internal API for Student Management.

This is the supported way for other features to read and write student data.
Features should call these functions instead of importing
``apps.students.models`` and querying ``Student.objects`` directly, so that
Student Management owns its own internals and can change them without
breaking every other feature.

Scope note: this module intentionally exposes only the operations that real
call sites need today. It is expected to grow as more features are moved onto
it — add a function here when a feature needs one, rather than reaching past
this boundary.
"""

from __future__ import annotations

from typing import Optional

from django.db.models import QuerySet

from .models import (
    ParentStudentLink,
    Student,
    StudentActivationToken,
    StudentGuardian,
)

# Read helpers ---------------------------------------------------------------


def get_student(student_id) -> Optional[Student]:
    """Return the student with this id, or ``None`` if there is no such student."""
    if not student_id:
        return None
    return (
        Student.objects.select_related('user', 'school', 'school_class')
        .filter(id=student_id)
        .first()
    )


def get_student_for_user(user) -> Optional[Student]:
    """Return the student profile owned by ``user``, or ``None``.

    Replaces the ``Student.objects.get(user=...)`` / ``DoesNotExist`` dance
    that callers were repeating. Returning ``None`` keeps the failure mode in
    the caller's hands without leaking the model's exception type.
    """
    if user is None or not getattr(user, 'is_authenticated', True):
        return None
    return (
        Student.objects.select_related('user', 'school', 'school_class')
        .filter(user=user)
        .first()
    )


def get_student_by_admission_number(admission_number) -> Optional[Student]:
    """Return the live student holding this admission number, or ``None``.

    Used by the public report-card verification page, so drafted students and
    students of drafted schools are deliberately excluded: a record that is not
    live must not be confirmed as authentic.
    """
    if not admission_number:
        return None
    return (
        Student.objects.select_related('user', 'school', 'school_class')
        .filter(
            user__is_drafted=False,
            school__is_drafted=False,
            admission_number=admission_number,
        )
        .first()
    )


def get_student_by_id_or_user(identifier) -> Optional[Student]:
    """Return a student matched by either their own id or their user id.

    Callers taking a ``student`` value straight off a request cannot always
    tell which of the two they were handed, so this accepts either.
    """
    if not identifier:
        return None
    from django.db.models import Q

    return (
        Student.objects.select_related('user', 'school', 'school_class')
        .filter(Q(id=identifier) | Q(user_id=identifier))
        .first()
    )


def list_students(school=None, school_class=None, class_name: str = '') -> QuerySet:
    """Return students, optionally narrowed to a school and/or a class.

    ``school`` and ``school_class`` accept either a model instance or a primary
    key. ``class_name`` matches the denormalised class label used for students
    who are not linked to a concrete class record.
    """
    queryset = Student.objects.select_related('user', 'school', 'school_class')
    if school is not None:
        queryset = queryset.filter(school=school)
    if school_class is not None:
        queryset = queryset.filter(school_class=school_class)
    if class_name:
        queryset = queryset.filter(student_class=class_name)
    return queryset


# Guardian / parent relationships --------------------------------------------
#
# A student can be linked to an adult in two ways: the older ParentStudentLink
# (parent user -> student) and the newer Guardian record (which may or may not
# own a user account). Callers should not have to know that; these helpers
# always consider both.


def get_guardian_users(student) -> list:
    """Return the user accounts of every parent/guardian linked to ``student``.

    Used for notifying the adults responsible for a student. Accounts are
    de-duplicated, and guardians without a user account are skipped.
    """
    if student is None:
        return []

    users = {}
    for link in ParentStudentLink.objects.filter(student=student).select_related('parent'):
        if link.parent_id:
            users[link.parent_id] = link.parent
    for entry in (
        StudentGuardian.objects.filter(student=student, guardian__user__isnull=False)
        .select_related('guardian__user')
    ):
        guardian_user = entry.guardian.user
        if guardian_user is not None:
            users[guardian_user.id] = guardian_user
    return list(users.values())


def get_guardian_users_by_student(students) -> dict:
    """Bulk form of :func:`get_guardian_users`, keyed by student id.

    Callers fanning out to a whole class must not call the single-student
    helper in a loop — that turns one query into N. This resolves every linked
    parent/guardian in a fixed number of queries and keeps the mapping, so a
    caller can still address each parent about their own child.

    ``students`` may be student instances or ids. Returns
    ``{student_id: [user, ...]}``, omitting students with no linked adults.
    """
    student_ids = [getattr(student, 'id', student) for student in students or []]
    student_ids = [student_id for student_id in student_ids if student_id]
    if not student_ids:
        return {}

    user_ids_by_student: dict = {}
    for student_id, parent_id in ParentStudentLink.objects.filter(
        student_id__in=student_ids
    ).values_list('student_id', 'parent_id'):
        if parent_id:
            user_ids_by_student.setdefault(student_id, set()).add(parent_id)
    for student_id, guardian_user_id in StudentGuardian.objects.filter(
        student_id__in=student_ids
    ).values_list('student_id', 'guardian__user_id'):
        if guardian_user_id:
            user_ids_by_student.setdefault(student_id, set()).add(guardian_user_id)

    all_user_ids = {uid for ids in user_ids_by_student.values() for uid in ids}
    if not all_user_ids:
        return {}

    from django.contrib.auth import get_user_model

    users_by_id = {
        user.id: user for user in get_user_model().objects.filter(id__in=all_user_ids)
    }
    return {
        student_id: [users_by_id[uid] for uid in ids if uid in users_by_id]
        for student_id, ids in user_ids_by_student.items()
    }


def list_student_ids_for_guardian(user) -> set:
    """Return the ids of every student ``user`` is a parent/guardian of."""
    if user is None:
        return set()
    student_ids = set(
        ParentStudentLink.objects.filter(parent=user).values_list('student_id', flat=True)
    )
    student_ids.update(
        StudentGuardian.objects.filter(guardian__user=user).values_list('student_id', flat=True)
    )
    return student_ids


def list_school_ids_for_guardian(user) -> set:
    """Return the ids of every school ``user`` has a child enrolled in.

    A parent's visibility is scoped by where their children study, not by their
    own ``school`` field — a parent with children in two schools must see both.
    """
    if user is None:
        return set()
    school_ids = set(
        ParentStudentLink.objects.filter(parent=user).values_list(
            'student__school_id', flat=True
        )
    )
    school_ids.update(
        StudentGuardian.objects.filter(guardian__user=user).values_list(
            'student__school_id', flat=True
        )
    )
    school_ids.discard(None)
    return school_ids


def list_class_ids_for_guardian(user) -> set:
    """Return the ids of every class ``user`` has a child in.

    Students not yet linked to a concrete class record contribute nothing, so
    the result never contains ``None`` and is safe to use directly in an
    ``__in`` lookup or a membership test.
    """
    if user is None:
        return set()
    class_ids = set(
        ParentStudentLink.objects.filter(parent=user).values_list(
            'student__school_class_id', flat=True
        )
    )
    class_ids.update(
        StudentGuardian.objects.filter(guardian__user=user).values_list(
            'student__school_class_id', flat=True
        )
    )
    class_ids.discard(None)
    return class_ids


def is_guardian_of(user, student) -> bool:
    """Return whether ``user`` is a parent/guardian of ``student``."""
    if user is None or student is None:
        return False
    if ParentStudentLink.objects.filter(parent=user, student=student).exists():
        return True
    return StudentGuardian.objects.filter(guardian__user=user, student=student).exists()


# Write helpers --------------------------------------------------------------


# Activation ------------------------------------------------------------------
#
# A school can pre-register a student as an activation token; the student later
# turns that token into a real account by signing up with their matricule.
# Sign-up belongs to authentication, but everything about what a student record
# is made of belongs here — which is why authentication asks these two
# questions rather than building a Student itself.


def has_pending_activation(matricule) -> bool:
    """Return whether ``matricule`` belongs to a student who can still activate."""
    if not matricule:
        return False
    return StudentActivationToken.objects.filter(
        matricule=matricule, is_used=False
    ).exists()


def activation_was_used(matricule) -> bool:
    """Return whether this matricule's activation has already been spent.

    Lets a caller tell "no such student" apart from "this account was already
    activated", which are different answers for whoever is signing up.
    """
    if not matricule:
        return False
    return StudentActivationToken.objects.filter(
        matricule=matricule, is_used=True
    ).exists()


def list_activation_matricules(prefix: str = '') -> list:
    """Return the matricules held by activation tokens, optionally by prefix.

    Matricule allocation has to avoid colliding with students who have been
    pre-registered but have not signed up yet, so the allocator needs to see
    matricules that no user account carries yet.
    """
    queryset = StudentActivationToken.objects.all()
    if prefix:
        queryset = queryset.filter(matricule__startswith=prefix)
    return list(queryset.values_list('matricule', flat=True))


def activation_matricule_exists(matricule) -> bool:
    """Return whether any activation token already holds this matricule."""
    if not matricule:
        return False
    return StudentActivationToken.objects.filter(matricule=matricule).exists()


def get_pending_activation(matricule) -> Optional[dict]:
    """Describe the unused activation waiting on ``matricule``, or ``None``.

    Returns plain data rather than the token record, so callers cannot start
    depending on the token's shape. ``placeholder_email`` is supplied because
    the caller has to create the user account before a student record exists.
    """
    if not matricule:
        return None
    token = StudentActivationToken.objects.select_related('school', 'school_class').filter(
        matricule=matricule, is_used=False
    ).first()
    if token is None:
        return None

    from .serializers import StudentCreateSerializer

    return {
        'matricule': token.matricule,
        'student_name': token.student_name or f'Student {token.matricule}',
        'school': token.school,
        'placeholder_email': StudentCreateSerializer()._generate_placeholder_email(
            token.matricule
        ),
    }


def create_student_from_activation(user, matricule) -> Optional[Student]:
    """Turn a pending activation into a real student record for ``user``.

    Allocates the admission number, generates the QR code and marks the token
    spent. Returns ``None`` if there is no unused token for this matricule, so
    a double activation cannot create a second student.
    """
    token = StudentActivationToken.objects.select_related('school', 'school_class').filter(
        matricule=matricule, is_used=False
    ).first()
    if token is None or user is None:
        return None

    from datetime import date

    from django.utils import timezone

    from .serializers import StudentCreateSerializer

    student = Student.objects.create(
        user=user,
        school=token.school,
        school_class=token.school_class,
        student_class=token.student_class,
        class_level=token.class_level,
        section=token.section,
        guardian_name='',
        guardian_phone='',
        guardian_whatsapp='',
        admission_number=StudentCreateSerializer()._generate_admission_number(token.school),
        admission_date=date.today(),
        gender='other',
    )
    student.generate_qr_code()

    token.is_used = True
    token.used_at = timezone.now()
    token.used_by = user
    token.save(update_fields=['is_used', 'used_at', 'used_by', 'modified'])
    return student


def relabel_class(school, old_class_name, school_class) -> int:
    """Move everyone recorded under ``old_class_name`` onto the renamed class.

    Called when a school renames a class. Student Management stores the class
    two ways — a link to the class record and a denormalised label for students
    who predate that link — and it also holds pending activation tokens that
    carry the same pair. Callers should not have to know any of that, which is
    why the whole cascade lives here.

    Returns the number of student records moved.
    """
    if not school or not old_class_name or school_class is None:
        return 0

    moved = Student.objects.filter(school=school, student_class=old_class_name).update(
        school_class=school_class,
        student_class=school_class.name,
    )
    StudentActivationToken.objects.filter(
        school=school, student_class=old_class_name
    ).update(school_class=school_class, student_class=school_class.name)
    return moved


def set_academic_standing(
    student: Student,
    *,
    annual_average=None,
    is_on_honour_roll: Optional[bool] = None,
) -> Student:
    """Record a student's computed academic standing.

    Grading owns the calculation; Student Management owns how (and where) the
    result is stored. Only the fields actually supplied are written.
    """
    updated_fields = []
    if annual_average is not None:
        student.annual_average = annual_average
        updated_fields.append('annual_average')
    if is_on_honour_roll is not None:
        student.is_on_honour_roll = is_on_honour_roll
        updated_fields.append('is_on_honour_roll')

    if updated_fields:
        student.save(update_fields=updated_fields)
    return student
