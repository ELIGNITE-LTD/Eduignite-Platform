from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.grades.models import ClassSubject
from apps.schools.relations import build_class_match_q
from apps.students import api as students_api

from .models import Exam, ExamSubmission
from .serializers import ExamSerializer, ExamSubmissionCreateSerializer, ExamSubmissionSerializer
from apps.registry.permissions import RequiresApp

SCHOOL_ADMIN_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN']
SCHOOL_STAFF_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN']


class ExamViewSet(viewsets.ModelViewSet):
    queryset = Exam.objects.select_related('school', 'subject', 'sequence', 'teacher').prefetch_related('questions')
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('exams')]

    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        mode = self.request.query_params.get('mode')
        if mode:
            queryset = queryset.filter(mode=mode)

        if user.role in SCHOOL_ADMIN_ROLES:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(school=user.school).filter(
                Q(teacher=user)
                | Q(subject__teacher=user)
                | Q(school_class__class_subjects__teacher=user)
            ).distinct()
        elif user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            if student is None:
                return queryset.none()
            queryset = queryset.filter(school=student.school).filter(
                build_class_match_q(
                    'school_class',
                    'target_class',
                    school_class_id=student.school_class_id,
                    class_name=student.student_class,
                )
            )
        elif user.role == 'PARENT':
            linked_students = students_api.list_students().filter(
                id__in=students_api.list_student_ids_for_guardian(user)
            )
            school_ids = [s.school_id for s in linked_students]
            class_ids = [s.school_class_id for s in linked_students if s.school_class_id]
            class_names = [s.student_class for s in linked_students if s.student_class]
            queryset = queryset.filter(school_id__in=school_ids).filter(
                Q(school_class_id__in=class_ids) | Q(target_class__in=class_names)
            ).distinct()
        else:
            queryset = queryset.none()

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in [*SCHOOL_ADMIN_ROLES, 'TEACHER']:
            raise PermissionDenied('Only school staff can create exams.')

        teacher = serializer.validated_data.get('teacher')
        school_class = serializer.validated_data.get('school_class')
        if user.role == 'TEACHER':
            teacher = user
        elif teacher is None and serializer.validated_data.get('subject') and school_class:
            class_subject = ClassSubject.objects.filter(
                school_class=school_class,
                subject=serializer.validated_data['subject'],
                teacher__isnull=False,
            ).select_related('teacher').first()
            teacher = class_subject.teacher if class_subject else None

        serializer.save(school=user.school, teacher=teacher)

    def perform_update(self, serializer):
        self._ensure_can_manage(self.get_object())
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_can_manage(instance)
        instance.delete()

    def _ensure_can_manage(self, exam: Exam):
        user = self.request.user
        if user.role in SCHOOL_ADMIN_ROLES:
            return
        if user.role == 'TEACHER' and (
            exam.teacher_id == user.id
            or exam.subject_id and exam.subject.teacher_id == user.id
            or exam.school_class and exam.school_class.class_subjects.filter(teacher=user).exists()
        ):
            return
        raise PermissionDenied('You are not allowed to manage this exam.')

    @action(detail=False, methods=['get'])
    def active(self, request):
        queryset = self.get_queryset().filter(mode=Exam.Mode.ONLINE, status=Exam.Status.SCHEDULED)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def roster(self, request, pk=None):
        """Who wrote vs. who was absent for this exam: all students of the
        exam's class, split by whether they have a submission."""
        exam = self.get_object()
        self._ensure_can_manage(exam)
        students = students_api.list_students(school=exam.school)
        if exam.school_class_id:
            students = students.filter(school_class_id=exam.school_class_id)
        elif exam.target_class:
            students = students.filter(student_class=exam.target_class)

        subs = {str(sub.student_id): sub for sub in exam.submissions.select_related('student__user')}
        wrote, absent = [], []
        for st in students:
            sub = subs.get(str(st.id))
            row = {
                'student_id': str(st.id),
                'name': st.user.get_full_name() if st.user else '',
                'matricule': (st.user.matricule if st.user else '') or '',
                'admission_number': st.admission_number or '',
            }
            if sub:
                row.update({
                    'score': float(sub.score) if sub.score is not None else None,
                    'total_marks': float(sub.total_marks) if sub.total_marks is not None else None,
                    'percentage': float(sub.percentage) if sub.percentage is not None else None,
                    'status': sub.status,
                    'submitted_at': sub.submitted_at,
                })
                wrote.append(row)
            else:
                absent.append(row)
        return Response({
            'exam': {'id': str(exam.id), 'title': exam.title, 'target_class': exam.target_class,
                     'mode': exam.mode, 'status': exam.status},
            'total_students': len(wrote) + len(absent),
            'wrote_count': len(wrote), 'absent_count': len(absent),
            'wrote': wrote, 'absent': absent,
        })

    @action(detail=True, methods=['post'], url_path='push-to-marks')
    def push_to_marks(self, request, pk=None):
        """Auto-fill the exam results into the Enter-Marks grade sheet for this
        exam's sequence + subject. Each written submission's score becomes the
        student's mark (rescaled to /20)."""
        exam = self.get_object()
        self._ensure_can_manage(exam)
        if not exam.sequence_id or not exam.subject_id:
            return Response(
                {'detail': 'This exam has no linked sequence/subject, so marks cannot be pushed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.grades.models import Grade

        created, updated = 0, 0
        for sub in exam.submissions.select_related('student').all():
            if sub.score is None:
                continue
            total = float(sub.total_marks) if sub.total_marks else 20.0
            mark20 = round((float(sub.score) / total) * 20, 2) if total else float(sub.score)
            mark20 = max(0.0, min(20.0, mark20))
            grade, was_created = Grade.objects.update_or_create(
                student_id=sub.student_id, subject_id=exam.subject_id, sequence_id=exam.sequence_id,
                defaults={
                    'school_id': exam.school_id, 'teacher': exam.teacher,
                    'score': mark20, 'comment': f'From online exam: {exam.title}'[:255],
                },
            )
            created += int(was_created)
            updated += int(not was_created)
        try:
            from apps.notifications.utils import notify_users

            recipients = [s.user for s in students_api.list_students().filter(
                id__in=exam.submissions.values_list('student_id', flat=True)) if s.user]
            notify_users(recipients, 'Exam marks published',
                         f'Your result for "{exam.title}" has been added to your marks.',
                         notification_type='grade_published', sender=request.user)
        except Exception:  # noqa: BLE001
            pass
        return Response({'created': created, 'updated': updated,
                         'detail': f'{created + updated} mark(s) written to the {exam.sequence.name} sheet.'})


class ExamSubmissionViewSet(viewsets.ModelViewSet):
    queryset = ExamSubmission.objects.select_related(
        'exam', 'exam__subject', 'exam__teacher', 'student', 'student__user'
    ).prefetch_related('exam__questions')
    serializer_class = ExamSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('exams')]

    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        exam_id = self.request.query_params.get('exam')
        if exam_id:
            queryset = queryset.filter(exam_id=exam_id)

        if user.role in SCHOOL_ADMIN_ROLES:
            queryset = queryset.filter(exam__school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(exam__school=user.school).filter(
                Q(exam__teacher=user)
                | Q(exam__subject__teacher=user)
                | Q(exam__school_class__class_subjects__teacher=user)
            ).distinct()
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user)
        elif user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            queryset = queryset.filter(student_id__in=linked_students)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = ExamSubmissionCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()
        output = ExamSubmissionSerializer(submission, context={'request': request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        raise PermissionDenied('Exam submissions cannot be edited directly.')

    def partial_update(self, request, *args, **kwargs):
        raise PermissionDenied('Exam submissions cannot be edited directly.')

    @action(detail=False, methods=['get'])
    def my_results(self, request):
        if request.user.role != 'STUDENT':
            raise PermissionDenied('Only students can view their exam results.')
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
