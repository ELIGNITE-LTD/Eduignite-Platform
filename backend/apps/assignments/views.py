from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.grades.models import ClassSubject
from apps.schools.relations import build_class_match_q
from apps.students import api as students_api

from .models import Assignment, AssignmentSubmission
from .serializers import (
    AssignmentSerializer,
    AssignmentSubmissionGradeSerializer,
    AssignmentSubmissionSerializer,
)
from apps.registry.permissions import RequiresApp


def _matches_student_assignment_class(student, assignment: Assignment) -> bool:
    if student.school_class_id and assignment.school_class_id == student.school_class_id:
        return True
    return assignment.target_class == student.student_class


def _ensure_assignment_is_open(assignment: Assignment):
    if assignment.status != Assignment.Status.PUBLISHED:
        raise ValidationError('This assignment is not open for submissions.')
    if timezone.now() > assignment.due_date:
        raise ValidationError({'due_date': 'The submission deadline has passed. This assignment is now closed.'})


class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.select_related('school', 'subject', 'teacher')
    serializer_class = AssignmentSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('assignments')]

    def get_queryset(self):
        user = self.request.user
        queryset = Assignment.objects.select_related('school', 'subject', 'teacher')

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(
                school=user.school
            ).filter(
                Q(teacher=user)
                | Q(subject__teacher=user)
                | Q(school_class__class_subjects__teacher=user)
            ).distinct()
        elif user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            if student is None:
                return queryset.none()
            queryset = queryset.filter(
                school=user.school,
            ).filter(
                build_class_match_q(
                    'school_class',
                    'target_class',
                    school_class_id=student.school_class_id,
                    class_name=student.student_class,
                ),
                status=Assignment.Status.PUBLISHED,
            )
        else:
            queryset = queryset.none()

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied('Only school staff can create assignments.')

        teacher = serializer.validated_data.get('teacher')
        subject = serializer.validated_data.get('subject')
        school_class = serializer.validated_data.get('school_class')
        if user.role == 'TEACHER':
            teacher = user
        elif teacher is None and subject and school_class:
            teacher = ClassSubject.objects.filter(
                school_class=school_class,
                subject=subject,
                teacher__isnull=False,
            ).select_related('teacher').first()
            teacher = teacher.teacher if teacher else None
        if teacher is None and subject and subject.teacher:
            teacher = subject.teacher

        assignment = serializer.save(
            school=user.school,
            teacher=teacher,
        )

        # Deliver a notification to every student the assignment targets (and,
        # via the notify helper, their parents too).
        try:
            from apps.notifications.utils import notify_users

            students = students_api.list_students(
                school=user.school,
                school_class=assignment.school_class_id or None,
                class_name='' if assignment.school_class_id else (assignment.target_class or ''),
            )
            recipients = [s.user for s in students if s.user_id]
            due = assignment.due_date.strftime('%d %b %Y') if assignment.due_date else ''
            notify_users(
                recipients,
                'New assignment',
                f'{assignment.title}'
                + (f' ({assignment.subject.name})' if assignment.subject_id else '')
                + (f' — due {due}' if due else ''),
                notification_type='assignment',
                sender=user,
            )
        except Exception:  # noqa: BLE001
            pass

    def perform_update(self, serializer):
        if self.request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied('Only school staff can update assignments.')
        self._ensure_can_manage(self.get_object())
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_can_manage(instance)
        instance.delete()

    def _ensure_can_manage(self, assignment: Assignment):
        user = self.request.user
        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return
        if user.role == 'TEACHER' and (
            assignment.teacher_id == user.id
            or assignment.subject.teacher_id == user.id
            or assignment.school_class and assignment.school_class.class_subjects.filter(teacher=user).exists()
        ):
            return
        raise PermissionDenied('You are not allowed to manage this assignment.')


class AssignmentSubmissionViewSet(viewsets.ModelViewSet):
    queryset = AssignmentSubmission.objects.select_related(
        'assignment', 'assignment__subject', 'assignment__teacher', 'student', 'student__user', 'graded_by'
    )
    serializer_class = AssignmentSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('assignments')]

    def get_queryset(self):
        user = self.request.user
        queryset = AssignmentSubmission.objects.select_related(
            'assignment', 'assignment__subject', 'assignment__teacher', 'student', 'student__user', 'graded_by'
        )

        assignment_id = self.request.query_params.get('assignment')
        if assignment_id:
            queryset = queryset.filter(assignment_id=assignment_id)

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            queryset = queryset.filter(assignment__school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(
                assignment__school=user.school
            ).filter(
                Q(assignment__teacher=user)
                | Q(assignment__subject__teacher=user)
                | Q(assignment__school_class__class_subjects__teacher=user)
            ).distinct()
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user)
        else:
            queryset = queryset.none()

        return queryset

    def perform_create(self, serializer):
        if self.request.user.role != 'STUDENT':
            raise PermissionDenied('Only students can submit assignment work.')

        student = students_api.get_student_for_user(self.request.user)
        if student is None:
            raise ValidationError('Student profile not found.')

        assignment = serializer.validated_data['assignment']
        if assignment.school_id != student.school_id:
            raise PermissionDenied('This assignment does not belong to your school.')
        if not _matches_student_assignment_class(student, assignment):
            raise PermissionDenied('This assignment is not assigned to your class.')
        _ensure_assignment_is_open(assignment)

        serializer.save(student=student, status=AssignmentSubmission.Status.SUBMITTED)

    def perform_update(self, serializer):
        submission = self.get_object()
        if self.request.user.role != 'STUDENT' or submission.student.user_id != self.request.user.id:
            raise PermissionDenied('Only the owning student can update this submission.')
        _ensure_assignment_is_open(submission.assignment)
        serializer.save(status=AssignmentSubmission.Status.SUBMITTED)

    @action(detail=False, methods=['get'])
    def my_submissions(self, request):
        if request.user.role != 'STUDENT':
            raise PermissionDenied('Only students can view their own submissions.')
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def grade(self, request, pk=None):
        submission = self.get_object()
        user = request.user
        if user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied('Only school staff can grade submissions.')
        if user.role == 'TEACHER' and not (
            submission.assignment.teacher_id == user.id
            or submission.assignment.subject.teacher_id == user.id
            or submission.assignment.school_class
            and submission.assignment.school_class.class_subjects.filter(teacher=user).exists()
        ):
            raise PermissionDenied('You are not allowed to grade this submission.')

        serializer = AssignmentSubmissionGradeSerializer(
            data=request.data,
            context={'submission': submission, 'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AssignmentSubmissionSerializer(submission).data, status=status.HTTP_200_OK)
