from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.grades.models import ClassSubject
from apps.students import api as students_api
from apps.users.models import UserRole

User = get_user_model()

SCHOOL_SUPPORT_ROLES = {
    UserRole.SCHOOL_ADMIN,
    UserRole.SUB_ADMIN,
    UserRole.BURSAR,
    UserRole.LIBRARIAN,
}

PLATFORM_EXECUTIVE_ROLES = {
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CTO,
    UserRole.COO,
    UserRole.INV,
    UserRole.DESIGNER,
    UserRole.SYSTEM_DEV,
}

PRIMARY_FOUNDER_ROLES = {
    UserRole.CEO,
    UserRole.CTO,
}

SCHOOL_ACCOUNT_ROLES = SCHOOL_SUPPORT_ROLES | {
    UserRole.TEACHER,
    UserRole.STUDENT,
    UserRole.PARENT,
}


def _user_ids_from_queryset(queryset):
    return {str(user_id) for user_id in queryset.values_list('id', flat=True)}


def get_related_user_ids(user) -> set[str]:
    if not getattr(user, 'is_authenticated', False):
        return set()

    if user.is_platform_executive:
        return _user_ids_from_queryset(
            User.objects.filter(
                Q(role__in=PLATFORM_EXECUTIVE_ROLES) | Q(role=UserRole.SCHOOL_ADMIN)
            ).exclude(id=user.id)
        )

    if not user.school_id:
        return set()

    related_ids: set[str] = set()
    school_users = User.objects.filter(school_id=user.school_id).exclude(id=user.id)

    if user.role == UserRole.SCHOOL_ADMIN:
        related_ids.update(school_users.values_list('id', flat=True))
        related_ids.update(
            User.objects.filter(role__in=PRIMARY_FOUNDER_ROLES)
            .exclude(id=user.id)
            .values_list('id', flat=True)
        )
        return {str(user_id) for user_id in related_ids}

    if user.role in SCHOOL_SUPPORT_ROLES:
        # Every school-support role (SUB_ADMIN/BURSAR/LIBRARIAN), not just
        # SCHOOL_ADMIN, must always be able to reach EduIgnite -- these are
        # exactly the roles authorized to use the EduIgnite Companion app,
        # whose "message EduIgnite" feature depends on this relation. Before
        # this fix, only SCHOOL_ADMIN got founder access; every other
        # companion-app-eligible role saw an empty contact list.
        related_ids.update(school_users.values_list('id', flat=True))
        related_ids.update(
            User.objects.filter(role__in=PRIMARY_FOUNDER_ROLES)
            .exclude(id=user.id)
            .values_list('id', flat=True)
        )
        return {str(user_id) for user_id in related_ids}

    if user.role == UserRole.TEACHER:
        taught_class_ids = set(
            ClassSubject.objects.filter(teacher=user)
            .values_list('school_class_id', flat=True)
        )
        related_ids.update(
            school_users.filter(role__in=SCHOOL_SUPPORT_ROLES).values_list('id', flat=True)
        )
        related_ids.update(
            school_users.filter(
                Q(role=UserRole.TEACHER, class_subject_links__school_class_id__in=taught_class_ids)
                | Q(role=UserRole.TEACHER, mastered_classes__id__in=taught_class_ids)
            )
            .distinct()
            .values_list('id', flat=True)
        )
        taught_students = list(
            students_api.list_students(school=user.school_id).filter(
                school_class_id__in=taught_class_ids
            )
        )
        related_ids.update(s.user_id for s in taught_students if s.user_id)
        for guardians in students_api.get_guardian_users_by_student(taught_students).values():
            related_ids.update(guardian.id for guardian in guardians)
        return {str(user_id) for user_id in related_ids}

    if user.role == UserRole.STUDENT:
        student = students_api.get_student_for_user(user)
        if not student:
            return _user_ids_from_queryset(school_users.filter(role__in=SCHOOL_SUPPORT_ROLES))

        related_ids.update(
            school_users.filter(role__in=SCHOOL_SUPPORT_ROLES).values_list('id', flat=True)
        )
        if student.school_class_id:
            related_ids.update(
                school_users.filter(
                    Q(role=UserRole.TEACHER, class_subject_links__school_class_id=student.school_class_id)
                    | Q(role=UserRole.TEACHER, mastered_classes__id=student.school_class_id)
                )
                .distinct()
                .values_list('id', flat=True)
            )
            related_ids.update(
                students_api.list_students(
                    school=user.school_id, school_class=student.school_class_id
                )
                .exclude(user_id=user.id)
                .values_list('user_id', flat=True)
            )
        related_ids.update(
            guardian.id for guardian in students_api.get_guardian_users(student)
        )
        return {str(user_id) for user_id in related_ids}

    if user.role == UserRole.PARENT:
        children = list(
            students_api.list_students().filter(
                id__in=students_api.list_student_ids_for_guardian(user)
            )
        )
        school_ids = {child.school_id for child in children if child.school_id}
        class_ids = {child.school_class_id for child in children if child.school_class_id}
        related_ids.update(child.user_id for child in children if child.user_id)
        related_ids.update(
            User.objects.filter(school_id__in=school_ids, role__in=SCHOOL_SUPPORT_ROLES)
            .exclude(id=user.id)
            .values_list('id', flat=True)
        )
        if class_ids:
            related_ids.update(
                User.objects.filter(
                    school_id__in=school_ids,
                    role=UserRole.TEACHER,
                    class_subject_links__school_class_id__in=class_ids,
                )
                .exclude(id=user.id)
                .distinct()
                .values_list('id', flat=True)
            )
        return {str(user_id) for user_id in related_ids}

    return _user_ids_from_queryset(school_users.filter(role__in=SCHOOL_ACCOUNT_ROLES))


def get_related_users(user):
    related_ids = get_related_user_ids(user)
    if not related_ids:
        return User.objects.none()
    return (
        User.objects.filter(id__in=related_ids)
        .select_related('school', 'sub_school')
        .order_by('name')
    )


def are_users_related(user, other_user) -> bool:
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.id == other_user.id:
        return False
    if user.is_platform_executive:
        return True
    return str(other_user.id) in get_related_user_ids(user)


def describe_relationships(user, other_user) -> list[str]:
    labels: list[str] = []

    if user.is_platform_executive:
        if other_user.role == UserRole.SCHOOL_ADMIN:
            labels.append('school admin')
        elif other_user.role in PLATFORM_EXECUTIVE_ROLES:
            labels.append('executive board')
        else:
            labels.append('platform network')
        return labels

    if user.role in SCHOOL_SUPPORT_ROLES and other_user.role in PRIMARY_FOUNDER_ROLES:
        labels.append('founder')

    if user.school_id and other_user.school_id and user.school_id == other_user.school_id:
        if other_user.role in SCHOOL_SUPPORT_ROLES:
            labels.append(other_user.get_role_display().lower())

    if user.role == UserRole.STUDENT:
        student = students_api.get_student_for_user(user)
        if student and other_user.role == UserRole.TEACHER and student.school_class_id:
            teaches_student = ClassSubject.objects.filter(
                school_class_id=student.school_class_id,
                teacher=other_user,
            ).exists()
            if teaches_student:
                labels.append('teacher')
        if student and other_user.role == UserRole.STUDENT:
            other_student = students_api.get_student_for_user(other_user)
            if other_student and other_student.school_class_id == student.school_class_id:
                labels.append('classmate')
        if other_user.role == UserRole.PARENT and student:
            if students_api.is_guardian_of(other_user, student):
                labels.append('guardian')

    if user.role == UserRole.TEACHER:
        taught_class_ids = set(
            ClassSubject.objects.filter(teacher=user).values_list('school_class_id', flat=True)
        )
        if other_user.role == UserRole.STUDENT:
            other_student = students_api.get_student_for_user(other_user)
            if other_student and other_student.school_class_id in taught_class_ids:
                labels.append('student')
        if other_user.role == UserRole.PARENT:
            if students_api.list_students().filter(
                id__in=students_api.list_student_ids_for_guardian(other_user),
                school_class_id__in=taught_class_ids,
            ).exists():
                labels.append('parent')
        if other_user.role == UserRole.TEACHER:
            if ClassSubject.objects.filter(
                teacher=other_user,
                school_class_id__in=taught_class_ids,
            ).exists():
                labels.append('teaching colleague')

    if user.role == UserRole.PARENT:
        if other_user.role == UserRole.STUDENT and students_api.is_guardian_of(
            user, students_api.get_student_for_user(other_user)
        ):
            labels.append('child')
        if other_user.role == UserRole.TEACHER:
            class_ids = students_api.list_students().filter(
                id__in=students_api.list_student_ids_for_guardian(user)
            ).values_list('school_class_id', flat=True)
            if ClassSubject.objects.filter(teacher=other_user, school_class_id__in=class_ids).exists():
                labels.append('teacher')

    if not labels and user.school_id and other_user.school_id and user.school_id == other_user.school_id:
        labels.append('same school')

    return list(dict.fromkeys(labels))


def get_teacher_group_options(user):
    if user.role != UserRole.TEACHER or not user.school_id:
        return []

    class_subjects = (
        ClassSubject.objects.filter(teacher=user, school_class__school_id=user.school_id)
        .select_related('school_class__sub_school', 'subject')
        .order_by('school_class__name', 'subject__name')
    )

    class_payloads: dict[str, dict] = {}
    for class_subject in class_subjects:
        class_id = str(class_subject.school_class_id)
        class_payload = class_payloads.setdefault(
            class_id,
            {
                'id': class_id,
                'name': class_subject.school_class.name,
                'sub_school_name': getattr(class_subject.school_class.sub_school, 'name', None),
                'student_count': students_api.list_students(
                    school=user.school_id,
                    school_class=class_subject.school_class_id,
                ).count(),
                'subjects': [],
            },
        )
        class_payload['subjects'].append(
            {
                'id': str(class_subject.subject_id),
                'name': class_subject.subject.name,
                'type': class_subject.type,
            }
        )

    return list(class_payloads.values())
