from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Avg
from django.utils import timezone
from apps.students import api as students_api

from .models import AcademicYear, Term, StudentPromotion, ClassSubject, StudentEnrollment, SubjectGrade
from .serializers import (
    AcademicYearSerializer,
    TermSerializer,
    StudentPromotionSerializer,
    ClassSubjectSerializer,
    StudentEnrollmentSerializer,
    SubjectGradeSerializer,
)


from apps.users.executive_access import has_platform_school_access

class AcademicYearViewSet(viewsets.ModelViewSet):
    """ViewSet for managing academic years."""

    serializer_class = AcademicYearSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if has_platform_school_access(user):
            return AcademicYear.objects.all()
        if user.school_id:
            return AcademicYear.objects.filter(school_id=user.school_id)
        return AcademicYear.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.school_id:
            serializer.save(school_id=user.school_id)
        else:
            return Response(
                {'detail': 'User must be associated with a school.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get the current academic year for the user's school."""
        user = request.user
        if not user.school_id:
            return Response(
                {'detail': 'User must be associated with a school.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        academic_year = AcademicYear.objects.filter(
            school_id=user.school_id,
            is_current=True,
            is_active=True,
        ).first()

        if academic_year:
            serializer = self.get_serializer(academic_year)
            return Response(serializer.data)

        return Response(
            {'detail': 'No current academic year found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    @action(detail=True, methods=['post'])
    def set_current(self, request, pk=None):
        """Set this academic year as the current one."""
        academic_year = self.get_object()
        user = request.user

        if user.role != 'SCHOOL_ADMIN' and not has_platform_school_access(user):
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        academic_year.is_current = True
        academic_year.save()

        serializer = self.get_serializer(academic_year)
        return Response(serializer.data)


class TermViewSet(viewsets.ModelViewSet):
    """ViewSet for managing terms."""

    serializer_class = TermSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if has_platform_school_access(user):
            return Term.objects.all()
        if user.school_id:
            return Term.objects.filter(academic_year__school_id=user.school_id)
        return Term.objects.none()

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get the current term for the user's school."""
        user = request.user
        if not user.school_id:
            return Response(
                {'detail': 'User must be associated with a school.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        term = Term.objects.filter(
            academic_year__school_id=user.school_id,
            is_current=True,
            is_active=True,
        ).first()

        if term:
            serializer = self.get_serializer(term)
            return Response(serializer.data)

        return Response(
            {'detail': 'No current term found.'},
            status=status.HTTP_404_NOT_FOUND,
        )


class ClassSubjectViewSet(viewsets.ModelViewSet):
    """ViewSet for managing class subjects."""

    serializer_class = ClassSubjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if has_platform_school_access(user):
            return ClassSubject.objects.all()
        if user.school_id:
            return ClassSubject.objects.filter(school_class__school_id=user.school_id)
        return ClassSubject.objects.none()


class StudentEnrollmentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing student enrollments."""

    serializer_class = StudentEnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if has_platform_school_access(user):
            return StudentEnrollment.objects.all()
        if user.school_id:
            return StudentEnrollment.objects.filter(student__school_id=user.school_id)
        if user.role == 'STUDENT':
            return StudentEnrollment.objects.filter(student__user=user)
        return StudentEnrollment.objects.none()

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Bulk create student enrollments for a term."""
        term_id = request.data.get('term_id')
        student_ids = request.data.get('student_ids', [])

        if not term_id or not student_ids:
            return Response(
                {'detail': 'term_id and student_ids are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            term = Term.objects.get(id=term_id)
        except Term.DoesNotExist:
            return Response(
                {'detail': 'Term not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        created_count = 0
        for student_id in student_ids:
            student = students_api.get_student(student_id)
            if student is None or not student.school_class:
                continue
            for class_subject in student.school_class.subjects.filter(is_active=True):
                StudentEnrollment.objects.get_or_create(
                    student=student,
                    term=term,
                    class_subject=class_subject,
                )
                created_count += 1

        return Response(
            {'detail': f'{created_count} enrollments created.'},
            status=status.HTTP_201_CREATED,
        )


class SubjectGradeViewSet(viewsets.ModelViewSet):
    """ViewSet for managing subject grades."""

    serializer_class = SubjectGradeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if has_platform_school_access(user):
            return SubjectGrade.objects.all()
        if user.role == 'TEACHER':
            return SubjectGrade.objects.filter(
                enrollment__class_subject__teacher=user
            )
        if user.school_id:
            return SubjectGrade.objects.filter(
                enrollment__student__school_id=user.school_id
            )
        if user.role == 'STUDENT':
            return SubjectGrade.objects.filter(enrollment__student__user=user)
        return SubjectGrade.objects.none()

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    @action(detail=False, methods=['get'])
    def student_transcript(self, request):
        """Get a student's transcript for a term."""
        student_id = request.query_params.get('student_id')
        term_id = request.query_params.get('term_id')

        if not student_id or not term_id:
            return Response(
                {'detail': 'student_id and term_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grades = SubjectGrade.objects.filter(
            enrollment__student_id=student_id,
            enrollment__term_id=term_id,
        ).select_related('enrollment__class_subject', 'enrollment__term')

        serializer = self.get_serializer(grades, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def class_performance(self, request):
        """Get performance statistics for a class."""
        class_id = request.query_params.get('class_id')
        term_id = request.query_params.get('term_id')

        if not class_id or not term_id:
            return Response(
                {'detail': 'class_id and term_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grades = SubjectGrade.objects.filter(
            enrollment__class_subject__school_class_id=class_id,
            enrollment__term_id=term_id,
        )

        stats = {
            'total_grades': grades.count(),
            'average_score': grades.aggregate(Avg('score'))['score__avg'] or 0,
            'highest_score': grades.aggregate(models.Max('score'))['score__max'],
            'lowest_score': grades.aggregate(models.Min('score'))['score__min'],
        }

        return Response(stats)


class StudentPromotionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing student promotions."""

    serializer_class = StudentPromotionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if has_platform_school_access(user):
            return StudentPromotion.objects.all()
        if user.school_id:
            return StudentPromotion.objects.filter(student__school_id=user.school_id)
        return StudentPromotion.objects.none()

    @action(detail=False, methods=['post'])
    def bulk_promote(self, request):
        """Bulk promote students to the next class."""
        academic_year_id = request.data.get('academic_year_id')
        promotion_data = request.data.get('promotions', [])

        if not academic_year_id:
            return Response(
                {'detail': 'academic_year_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        promoted_count = 0
        for data in promotion_data:
            student_id = data.get('student_id')
            promoted_to_class_id = data.get('promoted_to_class_id')
            status_value = data.get('status', 'promoted')

            try:
                promotion = StudentPromotion.objects.get(
                    student_id=student_id,
                    academic_year_id=academic_year_id,
                )
                promotion.promoted_to_class_id = promoted_to_class_id
                promotion.status = status_value
                promotion.promoted_by = request.user
                promotion.save()
                promoted_count += 1
            except StudentPromotion.DoesNotExist:
                continue

        return Response(
            {'detail': f'{promoted_count} students promoted.'},
            status=status.HTTP_200_OK,
        )
