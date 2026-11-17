"""Teacher workspace for principals, bursars and librarians.

A school admin (principal), sub administrator, bursar or librarian can run a real, separate
teacher account - a "twin" with role TEACHER tied to their own account - and
switch into it from their profile with no password. In the twin they are a
normal teacher with the full, unmixed teacher experience; their admin account
keeps only admin functionality.

First switch asks them to set up what they teach (class-subjects) and which
classes they are class master of. After that they can switch freely.
"""

from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.grades.models import ClassSubject
from apps.schools.models import ClassTeacherAssignment, SchoolClass
from .matricules import generate_school_user_matricule

# Everyone who can have a teacher account of their own beside their main one.
PRINCIPAL_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR', 'LIBRARIAN')


def _is_principal(user):
    return bool(
        getattr(user, 'is_authenticated', False)
        and not getattr(user, 'is_teacher_twin', False)
        and getattr(user, 'role', None) in PRINCIPAL_ROLES
        and getattr(user, 'school_id', None)
    )


def _twin_of(principal):
    return getattr(principal, 'teacher_twin', None)


def adopt_assignments(principal, twin):
    """Classes and subjects given to the main account belong in the teacher account.

    The school's setup screens let the head (or another staff member) be chosen as a class's teacher or class master.
    That person only teaches from their teacher account, so what was given to the main account moves across,
    otherwise the teacher account would show "No classes assigned yet".
    """
    if not twin or principal.pk == twin.pk:
        return 0
    school = principal.school
    moved = ClassSubject.objects.filter(teacher=principal, school_class__school=school).update(teacher=twin)
    moved += SchoolClass.objects.filter(class_master=principal, school=school).update(class_master=twin)
    for row in ClassTeacherAssignment.objects.filter(teacher=principal, school_class__school=school):
        # A class the teacher account already has is not duplicated.
        if ClassTeacherAssignment.objects.filter(teacher=twin, school_class=row.school_class).exists():
            row.delete()
        else:
            row.teacher = twin
            row.save(update_fields=['teacher'])
        moved += 1
    return moved


def _twin_payload(twin):
    if not twin:
        return None
    return {'id': str(twin.id), 'name': twin.name, 'matricule': twin.matricule}


def _workspace_state(principal):
    """Classes of the principal's school, each with its subjects, marking the
    ones already taught / mastered by the principal's teacher twin."""
    school = principal.school
    twin = _twin_of(principal)
    twin_id = twin.id if twin else None
    # What was given to the main account counts as the teacher account's own (it moves across on the next switch).
    mine_ids = {i for i in (twin_id, principal.id) if i}
    classes = (SchoolClass.objects
               .filter(school=school)
               .prefetch_related('class_subjects__subject', 'class_subjects__teacher')
               .order_by('name'))
    out = []
    for sc in classes:
        subjects = []
        for cs in sc.class_subjects.all():
            subjects.append({
                'class_subject_id': str(cs.id),
                'subject_name': getattr(cs.subject, 'name', ''),
                'mine': cs.teacher_id in mine_ids,
                'teacher_name': getattr(cs.teacher, 'name', '') if cs.teacher_id else '',
            })
        out.append({
            'id': str(sc.id),
            'name': sc.name,
            'is_class_master': sc.class_master_id in mine_ids,
            'subjects': subjects,
        })
    return {
        'enabled': twin is not None,
        'teacher': _twin_payload(twin),
        'classes': out,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def teacher_workspace(request):
    """Status + the data the setup form needs. Principals only."""
    if not _is_principal(request.user):
        return Response({'detail': 'Only school staff (administrator, bursar, librarian) have a teacher workspace.'}, status=403)
    return Response(_workspace_state(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def teacher_workspace_setup(request):
    """Create the teacher twin if needed and set exactly what it teaches.

    Body: {class_subject_ids: [uuid], class_master_ids: [uuid]}. Re-runnable:
    the twin's teaching is replaced with the selection each time, so the
    principal can edit it later from the same screen.
    """
    principal = request.user
    if not _is_principal(principal):
        return Response({'detail': 'Only school staff can set up a teacher workspace.'}, status=403)

    school = principal.school
    twin = _twin_of(principal)
    if twin is None:
        from . import models as users_models

        twin = users_models.User.objects.create_user(
            matricule=generate_school_user_matricule(school, 'TEACHER'),
            name=f'{principal.name} (Teacher)',
            email=f'teacher.twin.{principal.id}@twin.eduignite.local',
            role='TEACHER',
            password=None,
            is_active=True,
            school=school,
            phone=principal.phone or '',
            is_teacher_twin=True,
            admin_owner=principal,
        )
        twin.set_unusable_password()
        twin.save(update_fields=['password'])

    adopt_assignments(principal, twin)
    cs_ids = [str(x) for x in (request.data.get('class_subject_ids') or [])]
    cm_ids = [str(x) for x in (request.data.get('class_master_ids') or [])]
    from apps.schools.class_teaching import is_basic_school

    if is_basic_school(school) and len(set(cm_ids)) > 1:
        return Response(
            {'detail': 'In a nursery or primary school a teacher teaches only one class. Choose one class.',
             'code': 'teacher_already_has_class'},
            status=status.HTTP_409_CONFLICT,
        )

    # Replace the twin's subject teaching with the current selection (scoped to
    # this school only, so nothing elsewhere can be touched).
    ClassSubject.objects.filter(teacher=twin).update(teacher=None)
    if cs_ids:
        ClassSubject.objects.filter(id__in=cs_ids, school_class__school=school).update(teacher=twin)

    # Same for class mastership.
    SchoolClass.objects.filter(class_master=twin).update(class_master=None)
    if cm_ids:
        SchoolClass.objects.filter(id__in=cm_ids, school=school).update(class_master=twin)

    return Response(_workspace_state(principal), status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def teacher_workspace_switch(request):
    """Issue sign-in tokens for the principal's own teacher twin - no password.
    The principal keeps their own tokens client-side to switch back."""
    principal = request.user
    if not _is_principal(principal):
        return Response({'detail': 'Only school staff can switch to a teacher account.'}, status=403)
    twin = _twin_of(principal)
    if twin is None:
        return Response({'detail': 'Set up your teacher account first.', 'needs_setup': True}, status=400)
    if not twin.is_active:
        return Response({'detail': 'Your teacher account is not active.'}, status=400)

    adopt_assignments(principal, twin)
    refresh = RefreshToken.for_user(twin)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'teacher': _twin_payload(twin),
    })
