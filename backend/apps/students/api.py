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

from django.db.models import Q, QuerySet

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
            Q(user__isnull=True) | Q(user__is_drafted=False),
            school__is_drafted=False,
            admission_number=admission_number,
        )
        .first()
    )


AMBIGUOUS = 'ambiguous'


def resolve_public_student(admission_number, school_ref=None):
    """Resolve a student for a public QR scan.

    Admission numbers ("0001", "0002"...) are only unique *within* a school, so
    two schools routinely issue the same one. The QR therefore also carries the
    school's matricule (``school_ref``). Returns the live student, ``None`` when
    nothing matches, or ``AMBIGUOUS`` when an old QR without a school reference
    matches several schools.
    """
    if not admission_number:
        return None
    qs = Student.objects.select_related('user', 'school', 'school_class').filter(
        Q(user__isnull=True) | Q(user__is_drafted=False),
        school__is_drafted=False,
        admission_number=admission_number,
    )
    if school_ref:
        qs = qs.filter(Q(school__matricule=school_ref) | Q(school_id=school_ref))
    matches = list(qs[:2])
    if not matches:
        return None
    if len(matches) > 1:
        return AMBIGUOUS
    return matches[0]


def get_student_by_id_or_user(identifier) -> Optional[Student]:
    """Return a student matched by either their own id or their user id.

    Callers taking a ``student`` value straight off a request cannot always
    tell which of the two they were handed, so this accepts either.
    """
    if not identifier:
        return None
    return (
        Student.objects.select_related('user', 'school', 'school_class')
        .filter(Q(id=identifier) | Q(user_id=identifier))
        .first()
    )


def attach_login(student: Student, *, email: str = '', password: str = '') -> Student:
    """Give a login-less learner an account, keeping their matricule.

    The account is created with the matricule already stored on the learner
    (generated through the one matricule generator when they were enrolled),
    so nothing the school printed or told the family changes. The password
    defaults to the same "pending activation" marker used for every student
    the school creates, so the learner sets their own on first sign-in.
    Idempotent: a learner who already has a login is returned unchanged.
    """
    from django.contrib.auth import get_user_model
    from django.db import transaction

    from apps.users.matricules import generate_school_user_matricule

    if student.user_id:
        return student

    User = get_user_model()
    with transaction.atomic():
        locked = Student.objects.select_for_update().get(pk=student.pk)
        if locked.user_id:
            student.user = locked.user
            return student
        matricule = locked.matricule or generate_school_user_matricule(locked.school, 'STUDENT')
        email = (email or '').strip()
        if not email:
            email = f'{matricule.lower()}@students.eduignite.local'
            while User.objects.filter(email=email).exists():
                import uuid

                email = f'{matricule.lower()}.{uuid.uuid4().hex[:4]}@students.eduignite.local'
        user = User.objects.create_user(
            matricule=matricule,
            name=locked.name,
            email=email,
            role='STUDENT',
            school=locked.school,
            password=password or '!pending_activation',
        )
        locked.user = user
        locked.matricule = matricule
        locked.save()
    student.user = user
    student.matricule = matricule
    return student


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



def enrol_student(*, user, school, admission_number, student_class='', **fields) -> Student:
    """Create a student record for an existing user account.

    Here rather than in each caller because Student Management owns its own
    models: anything else that needs to enrol someone goes through this,
    which is the boundary core/tests/test_module_boundaries.py enforces.
    """
    return Student.objects.create(
        user=user,
        school=school,
        admission_number=admission_number,
        student_class=student_class,
        **fields,
    )



def upsert_student(*, school, admission_number, defaults=None):
    """Create or update the student a school knows by this admission number.

    A school plus an admission number is how a student is identified when
    records arrive from somewhere else - an offline install being migrated
    into the cloud, for instance - because ids generated on one machine mean
    nothing on another. Returns ``(student, created)``, like the ORM call it
    replaces.
    """
    return Student.objects.update_or_create(
        school=school,
        admission_number=admission_number,
        defaults=defaults or {},
    )


def list_admission_numbers(school) -> set:
    """Every admission number already used at this school."""
    return set(list_students(school=school).values_list('admission_number', flat=True))


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
    codes = list(queryset.values_list('matricule', flat=True))
    # Learners without a login account hold their matricule on the student
    # record itself; they must be counted too or the allocator would reissue it.
    held = Student.objects.filter(matricule__isnull=False)
    if prefix:
        held = held.filter(matricule__startswith=prefix)
    return codes + list(held.values_list('matricule', flat=True))


def activation_matricule_exists(matricule) -> bool:
    """Return whether any activation token already holds this matricule."""
    if not matricule:
        return False
    return (
        StudentActivationToken.objects.filter(matricule=matricule).exists()
        or Student.objects.filter(matricule=matricule).exists()
    )


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


def self_activation_available(student_id) -> bool:
    """Whether a student still has their one-time self-activation to spend.

    Read-only. `claim_self_activation` spends it, which is what the activation
    form needs; this is for everything that only wants to know, such as
    telling a student who has forgotten their password whether to activate
    their account or to go and see their principal.
    """

    return Student.objects.filter(pk=student_id, self_activation_used=False).exists()


def claim_self_activation(student_id) -> bool:
    """Spend a student's one-time self-activation. True only for the caller that
    spends it.

    A single conditional UPDATE, so two requests arriving together cannot both
    succeed: the database lets exactly one of them flip the flag. Call it inside
    the transaction that then sets the password, so a failure afterwards rolls
    the claim back.
    """
    from django.utils import timezone

    return Student.objects.filter(pk=student_id, self_activation_used=False).update(
        self_activation_used=True,
        self_activated_at=timezone.now(),
    ) == 1


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


def sync_class_students(school_class) -> int:
    """Make every student of ``school_class`` follow the class's current details.

    The class is the source of truth for the values a student row copies from
    it (class name, level, section - see ``class_sync``). Call this whenever a
    class is saved. Only rows that actually differ are written, so it is cheap
    and idempotent, and it never changes which class a student is in.
    Unused activation tokens for the class are kept in step too.

    Returns the number of student rows changed.
    """
    from .class_sync import enforced_class_fields

    if school_class is None or not school_class.pk:
        return 0
    values = enforced_class_fields(school_class)
    changed = (
        Student.objects.filter(school_class=school_class)
        .exclude(**values)
        .update(**values)
    )
    StudentActivationToken.objects.filter(school_class=school_class, is_used=False).exclude(**values).update(**values)
    return changed


def relabel_class(school, old_class_name, school_class) -> int:
    """Move everyone recorded under ``old_class_name`` onto the renamed class.

    Called when a school renames a class. Student Management stores the class
    two ways - a link to the class record and a denormalised label for students
    who predate that link - and it also holds pending activation tokens that
    carry the same pair. Callers should not have to know any of that, which is
    why the whole cascade lives here.

    A student who is already linked to a *different* class is never moved just
    because their stale label matches the old name; only students linked to
    this class, or not linked to any class, follow the rename.

    Returns the number of student records changed.
    """
    from .class_sync import enforced_class_fields

    if not school or not old_class_name or school_class is None:
        return 0

    values = enforced_class_fields(school_class)
    unlinked = Student.objects.filter(
        school=school, school_class__isnull=True, student_class=old_class_name
    ).update(school_class=school_class, **values)
    linked = sync_class_students(school_class)
    StudentActivationToken.objects.filter(
        school=school, school_class__isnull=True, student_class=old_class_name
    ).update(school_class=school_class, **values)
    return unlinked + linked


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
