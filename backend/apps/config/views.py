from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
import logging

from .cameroon_data import (
    CAMEROON_REGIONS,
    SCHOOL_TYPES,
    EDUCATION_CATEGORIES,
    SUBSYSTEMS,
    CLASS_LEVELS,
    TECHNICAL_SPECIALISATIONS,
    SUBJECTS,
    EXAM_TYPES,
    TERMS,
    FEE_TYPES,
    STAFF_ROLES,
    GENDER_OPTIONS,
    GUARDIAN_RELATIONSHIPS,
    SUBSCRIPTION_PLANS,
)
from .translationService import TranslationError, translate_many, translate_text as libre_translate_text

User = get_user_model()
logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def cameroon_config(request):
    """
    Public endpoint returning all static Cameroonian education system data
    needed to power dynamic dropdowns across all forms.
    No authentication required.
    """
    return Response({
        'regions': CAMEROON_REGIONS,
        'school_types': SCHOOL_TYPES,
        'education_categories': EDUCATION_CATEGORIES,
        'subsystems': SUBSYSTEMS,
        'class_levels': CLASS_LEVELS,
        'technical_specialisations': TECHNICAL_SPECIALISATIONS,
        'subjects': SUBJECTS,
        'exam_types': EXAM_TYPES,
        'terms': TERMS,
        'fee_types': FEE_TYPES,
        'staff_roles': STAFF_ROLES,
        'gender_options': GENDER_OPTIONS,
        'guardian_relationships': GUARDIAN_RELATIONSHIPS,
        'subscription_plans': SUBSCRIPTION_PLANS,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_config(request):
    """
    School-scoped endpoint returning live dropdown data for the current school.
    Returns classes, subjects, sub-schools, and teachers for admin forms.
    Requires authentication. School admins see their own school only.
    """
    user = request.user

    # Determine which school to load data for
    if user.role in ('SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'):
        school = user.school
        if not school:
            return Response(
                {'detail': 'Your account is not linked to a school.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    elif user.role in ('SUPER_ADMIN', 'CEO', 'CTO', 'COO'):
        # Executives can pass school_id as query param
        school_id = request.query_params.get('school_id')
        if not school_id:
            return Response(
                {'detail': 'Pass school_id as a query parameter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.schools.models import School
        try:
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            return Response(
                {'detail': 'School not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
    else:
        return Response(
            {'detail': 'You do not have permission to access school configuration.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    from apps.schools.models import SubSchool, SchoolClass
    from apps.grades.models import Subject, ClassSubject

    # Sub-schools
    sub_schools = list(
        SubSchool.objects.filter(school=school)
        .values('id', 'name')
        .order_by('name')
    )

    # Classes
    classes_qs = SchoolClass.objects.filter(school=school).select_related('sub_school').order_by('name')
    classes = [
        {
            'id': str(c.id),
            'name': c.name,
            'sub_school_id': str(c.sub_school_id) if c.sub_school_id else None,
            'sub_school_name': c.sub_school.name if c.sub_school else None,
            'class_master_id': str(c.class_master_id) if c.class_master_id else None,
        }
        for c in classes_qs
    ]

    # Subjects (school-level)
    subjects_qs = Subject.objects.filter(school=school, is_active=True).select_related('teacher').order_by('name')
    subjects = [
        {
            'id': str(s.id),
            'name': s.name,
            'code': s.code,
            'level': s.level,
            'coefficient': float(s.coefficient),
            'teacher_id': str(s.teacher_id) if s.teacher_id else None,
            'teacher_name': s.teacher.name if s.teacher else None,
        }
        for s in subjects_qs
    ]

    # Class-subject links (for assigning teachers to class-subject pairs)
    class_subjects_qs = (
        ClassSubject.objects.filter(school_class__school=school)
        .select_related('school_class', 'subject', 'teacher')
        .order_by('school_class__name', 'subject__name')
    )
    class_subjects = [
        {
            'id': str(cs.id),
            'class_id': str(cs.school_class_id),
            'class_name': cs.school_class.name,
            'subject_id': str(cs.subject_id),
            'subject_name': cs.subject.name,
            'subject_code': cs.subject.code,
            'coefficient': float(cs.subject.coefficient),
            'teacher_id': str(cs.teacher_id) if cs.teacher_id else None,
            'teacher_name': cs.teacher.name if cs.teacher else None,
            'type': cs.type,
        }
        for cs in class_subjects_qs
    ]

    # Teachers in this school
    teachers_qs = User.objects.filter(
        school=school,
        role__in=['TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN'],
        is_active=True,
    ).order_by('name')
    teachers = [
        {
            'id': str(t.id),
            'name': t.name,
            'email': t.email,
            'role': t.role,
            'matricule': t.matricule,
        }
        for t in teachers_qs
    ]

    # All staff (for form master selection etc)
    all_staff_qs = User.objects.filter(
        school=school,
        role__in=['TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN', 'BURSAR', 'LIBRARIAN'],
        is_active=True,
    ).order_by('name')
    all_staff = [
        {
            'id': str(s.id),
            'name': s.name,
            'email': s.email,
            'role': s.role,
            'matricule': s.matricule,
        }
        for s in all_staff_qs
    ]

    # Existing parents in this school (for linking to new students)
    parents_qs = User.objects.filter(
        school=school,
        role='PARENT',
        is_active=True,
    ).order_by('name')
    parents = [
        {
            'id': str(p.id),
            'name': p.name,
            'email': p.email,
            'phone': p.phone or '',
            'matricule': p.matricule,
        }
        for p in parents_qs
    ]

    return Response({
        'school': {
            'id': school.id,
            'name': school.name,
            'short_name': school.short_name,
            'school_type': school.school_type,
            'subsystem': school.subsystem,
        },
        'sub_schools': sub_schools,
        'classes': classes,
        'subjects': subjects,
        'class_subjects': class_subjects,
        'teachers': teachers,
        'all_staff': all_staff,
        'parents': parents,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def translate_text(request):
    """
    LibreTranslate-only translation proxy for the frontend language system.
    Supports the public single-text contract and the legacy UI batch contract.
    """
    target_language = (
        request.data.get('targetLang')
        or request.data.get('target_language')
        or request.data.get('target')
    )
    source_language = (
        request.data.get('sourceLang')
        or request.data.get('source_language')
        or request.data.get('source')
        or None
    )

    try:
        if 'text' in request.data:
            result = libre_translate_text(request.data.get('text'), target_language, source_language)
            return Response(result)

        raw_texts = request.data.get('texts')
        if not isinstance(raw_texts, list):
            return Response({'detail': 'Provide text or texts for translation.'}, status=status.HTTP_400_BAD_REQUEST)
        results = translate_many(raw_texts[:80], target_language, source_language)
        return Response({
            'translations': [item['translatedText'] for item in results],
            'sourceLang': results[0]['sourceLang'] if results else source_language,
            'targetLang': results[0]['targetLang'] if results else target_language,
            'provider': 'LibreTranslate',
            'cached': bool(results) and all(item['cached'] for item in results),
            'fallback': bool(results) and any(item.get('fallback') for item in results),
        })
    except TranslationError as exc:
        return Response({'detail': exc.public_message, 'provider': 'LibreTranslate'}, status=exc.status_code)
