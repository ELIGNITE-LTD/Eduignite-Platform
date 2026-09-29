import logging

from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .throttles import AIRateThrottle
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext_lazy as _
from django.db.models import Q

from apps.users.models import User
from apps.students import api as students_api
from apps.grades.models import Grade, Sequence
from apps.attendance.models import AttendanceRecord
from apps.schools.models import School

from .models import AIRequest, AIInsight
from .serializers import (
    AIRequestSerializer,
    AIRequestCreateSerializer,
    StudyPlanRequestSerializer,
    GradeAnalysisRequestSerializer,
    AttendanceInsightRequestSerializer,
    ExamPrepRequestSerializer,
    ParentReportRequestSerializer,
    AIInsightSerializer
)
from .tasks import process_ai_request, generate_weekly_insights
from .utils import check_ai_quota
from apps.registry.permissions import RequiresApp


logger = logging.getLogger(__name__)
EXECUTIVE_ROLES = {'SUPER_ADMIN', 'CEO', 'CTO', 'COO', 'INV', 'DESIGNER'}
SCHOOL_ADMIN_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}
SCHOOL_STAFF_ROLES = {*SCHOOL_ADMIN_ROLES, 'TEACHER', 'BURSAR', 'LIBRARIAN'}
BACKGROUND_WORKER_ERROR = (
    'AI background worker is unavailable. Please make sure Redis and the Celery worker '
    'are running, then try again.'
)


def _role(user):
    return (getattr(user, 'role', '') or '').upper()


def _user_school(user):
    return getattr(user, 'school', None) if getattr(user, 'school_id', None) else None


def _get_student(identifier):
    return students_api.get_student_by_id_or_user(identifier)


def _student_class_name(student):
    return (
        getattr(getattr(student, 'school_class', None), 'name', None)
        or getattr(student, 'student_class', None)
        or 'N/A'
    )


def _can_access_student(user, student):
    role = _role(user)
    if role in EXECUTIVE_ROLES:
        return True
    if role in SCHOOL_STAFF_ROLES:
        return bool(getattr(user, 'school_id', None) and student.school_id == user.school_id)
    if role == 'STUDENT':
        return student.user_id == user.id
    if role == 'PARENT':
        return students_api.is_guardian_of(user, student)
    return False


def _queue_ai_request(ai_request):
    try:
        if settings.CELERY_TASK_ALWAYS_EAGER and not getattr(settings, 'AI_ALLOW_SYNC_FALLBACK', False):
            raise RuntimeError('CELERY_TASK_ALWAYS_EAGER is enabled, which would run this AI job inside the web request.')
        process_ai_request.apply_async(args=[str(ai_request.id)], retry=False)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.exception('Unable to enqueue AI request %s', ai_request.id)
        ai_request.mark_failed(f'{BACKGROUND_WORKER_ERROR} ({exc})')
        return Response({'error': BACKGROUND_WORKER_ERROR}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AIRequestViewSet(viewsets.ModelViewSet):
    serializer_class = AIRequestSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]
    throttle_classes = [AIRateThrottle]

    def get_queryset(self):
        """Get AI requests based on user role."""
        user = self.request.user
        queryset = AIRequest.objects.all()
        role = _role(user)

        if role == 'STUDENT':
            queryset = queryset.filter(user=user)
        elif role == 'PARENT':
            children_user_ids = students_api.list_students().filter(
                id__in=students_api.list_student_ids_for_guardian(user)
            ).values_list('user_id', flat=True)
            queryset = queryset.filter(Q(user=user) | Q(user_id__in=children_user_ids))
        elif role == 'TEACHER':
            if not getattr(user, 'school_id', None):
                return queryset.none()
            queryset = queryset.filter(Q(user=user) | Q(school_id=user.school_id))
        elif role in SCHOOL_ADMIN_ROLES:
            if not getattr(user, 'school_id', None):
                return queryset.none()
            queryset = queryset.filter(school_id=user.school_id)
        elif role not in EXECUTIVE_ROLES:
            queryset = queryset.filter(user=user)

        return queryset.select_related('user', 'school').order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return AIRequestCreateSerializer
        return AIRequestSerializer

    def create(self, request, *args, **kwargs):
        """Create a new AI request."""
        # Check quota
        if not check_ai_quota(request.user):
            return Response(
                {'error': _('You have reached your AI request quota for this period.')},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Get user's school
        school = _user_school(request.user)

        # Create AI request
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            status='pending',
            **serializer.validated_data
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'], url_path='generate-study-plan')
    def generate_study_plan(self, request):
        """Generate AI-powered study plan for a student."""
        serializer = StudyPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data['student_id']
        subjects = serializer.validated_data['subjects']
        weeks = serializer.validated_data.get('weeks', 4)

        student = _get_student(student_id)
        if not student:
            return Response(
                {'error': _('Student not found.')},
                status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_student(request.user, student):
            return Response(
                {'error': _('You do not have permission to access this student.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check quota
        if not check_ai_quota(request.user):
            return Response(
                {'error': _('You have reached your AI request quota.')},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        from .utils import build_study_plan_prompt

        student_data = {
            'name': student.user.get_full_name(),
            'grade': _student_class_name(student),
            'academic_level': getattr(student, 'academic_level', 'Average'),
        }

        prompt = build_study_plan_prompt(student_data, subjects, weeks)

        school = _user_school(request.user)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='study_plan',
            prompt=prompt,
            status='pending'
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'], url_path='analyze-grades')
    def analyze_grades(self, request):
        """Analyze student grades and provide insights."""
        serializer = GradeAnalysisRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data['student_id']
        sequence_id = serializer.validated_data.get('sequence_id')

        student = _get_student(student_id)
        if not student:
            return Response(
                {'error': _('Student not found.')},
                status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_student(request.user, student):
            return Response(
                {'error': _('You do not have permission to access this student.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check quota
        if not check_ai_quota(request.user):
            return Response(
                {'error': _('You have reached your AI request quota.')},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        from .utils import build_grade_analysis_prompt

        # Get grades
        grades_queryset = Grade.objects.filter(student=student)
        if sequence_id:
            grades_queryset = grades_queryset.filter(sequence_id=sequence_id)

        grades_data = {}
        for grade in grades_queryset[:10]:  # Last 10 grades
            subject = grade.subject.name if grade.subject else 'Unknown'
            grades_data[subject] = {
                'grade': grade.score,
                'trend': getattr(grade, 'trend', None) or 'stable'
            }

        student_data = {
            'name': student.user.get_full_name(),
            'grade': _student_class_name(student),
            'gpa': getattr(student, 'gpa', 'N/A'),
        }

        prompt = build_grade_analysis_prompt(student_data, grades_data)

        school = _user_school(request.user)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='grade_analysis',
            prompt=prompt,
            status='pending'
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'], url_path='attendance-insight')
    def attendance_insight(self, request):
        """Get attendance insights for a student or class."""
        serializer = AttendanceInsightRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data.get('student_id')
        class_name = serializer.validated_data.get('class_name')
        days = serializer.validated_data.get('days', 30)

        # Check quota
        if not check_ai_quota(request.user):
            return Response(
                {'error': _('You have reached your AI request quota.')},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        from .utils import build_attendance_prompt
        from datetime import timedelta
        from django.utils import timezone

        attendance_data = {}

        if student_id:
            student = _get_student(student_id)
            if not student:
                return Response(
                    {'error': _('Student not found.')},
                    status=status.HTTP_404_NOT_FOUND
                )
            if not _can_access_student(request.user, student):
                return Response(
                    {'error': _('You do not have permission to access this student.')},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get attendance records
            start_date = (timezone.now() - timedelta(days=days)).date()
            attendance_records = AttendanceRecord.objects.filter(
                student=student,
                session__date__gte=start_date
            ).order_by('session__date')

            present = attendance_records.filter(status='present').count()
            absent = attendance_records.filter(status='absent').count()
            late = attendance_records.filter(status='late').count()
            total = attendance_records.count()

            attendance_data = {
                'present': present,
                'absent': absent,
                'late': late,
                'attendance_rate': (present / total * 100) if total > 0 else 0,
                'pattern': [record.status for record in attendance_records]
            }

        prompt = build_attendance_prompt(attendance_data)

        school = _user_school(request.user)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='attendance_insight',
            prompt=prompt,
            status='pending'
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'], url_path='exam-prep')
    def exam_prep(self, request):
        """Get exam preparation tips for a student and subject."""
        serializer = ExamPrepRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data['student_id']
        subject_id = serializer.validated_data['subject_id']

        # Check quota
        if not check_ai_quota(request.user):
            return Response(
                {'error': _('You have reached your AI request quota.')},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        student = _get_student(student_id)
        if not student:
            return Response(
                {'error': _('Student not found.')},
                status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_student(request.user, student):
            return Response(
                {'error': _('You do not have permission to access this student.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get subject
        try:
            from apps.grades.models import Subject
            subject = Subject.objects.get(id=subject_id)
        except Subject.DoesNotExist:
            return Response(
                {'error': _('Subject not found.')},
                status=status.HTTP_404_NOT_FOUND
            )
        if subject.school_id != student.school_id:
            return Response(
                {'error': _('Subject does not belong to this student school.')},
                status=status.HTTP_403_FORBIDDEN
            )

        exam_date = serializer.validated_data.get('exam_date')

        prompt = f"""Create a comprehensive exam preparation guide for {student.user.get_full_name()} for {subject.name}.

Student Level: {_student_class_name(student)}
Subject: {subject.name}
Exam Date: {exam_date or 'To be scheduled'}

Please provide:
1. Key topics and concepts to focus on
2. Common exam questions and formats
3. Study schedule leading up to the exam
4. Tips for effective revision
5. Time management strategies during exam
6. Common mistakes to avoid
7. Practice questions and solutions
8. Mental preparation and confidence building

Make the guide practical and actionable."""

        school = _user_school(request.user)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='exam_prep',
            prompt=prompt,
            status='pending'
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'], url_path='parent-report')
    def parent_report(self, request):
        """Generate parent-friendly progress report."""
        serializer = ParentReportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data['student_id']

        # Check quota
        if not check_ai_quota(request.user):
            return Response(
                {'error': _('You have reached your AI request quota.')},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        student = _get_student(student_id)
        if not student:
            return Response(
                {'error': _('Student not found.')},
                status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_student(request.user, student):
            return Response(
                {'error': _('You do not have permission to access this student.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get student data
        recent_grades = Grade.objects.filter(student=student).order_by('-created_at')[:5]
        grades_str = ', '.join([f"{g.subject.name}: {g.score}" for g in recent_grades])

        prompt = f"""Create a parent-friendly progress report for {student.user.get_full_name()}.

Academic Information:
- Current Class: {_student_class_name(student)}
- Recent Grades: {grades_str or 'No recent grades'}
- GPA: {getattr(student, 'gpa', 'N/A')}

Please provide:
1. Overall academic summary (in simple language)
2. Strengths and accomplishments
3. Areas for improvement with specific suggestions
4. Attendance status (if applicable)
5. Behavioral observations (if applicable)
6. Suggested ways parents can support learning at home
7. Next steps and goals
8. Contact information for follow-up

Use simple, encouraging language that is easy for parents to understand."""

        school = _user_school(request.user)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='parent_report',
            prompt=prompt,
            status='pending'
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'], url_path='platform-insights')
    def platform_insights(self, request):
        """Get platform-wide analytics summary (executives only)."""
        if _role(request.user) not in {*EXECUTIVE_ROLES, *SCHOOL_ADMIN_ROLES}:
            return Response(
                {'error': _('Only executives and school admins can access platform insights.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get aggregated school data
        school = _user_school(request.user)

        prompt = f"""Generate a comprehensive platform-wide analytics summary report.

School: {school.name if school else 'All Schools'}

Please include:
1. Overall student performance trends
2. Attendance statistics and patterns
3. Subject-wise performance analysis
4. High-performing students and areas of excellence
5. At-risk students and intervention areas
6. Teacher effectiveness indicators
7. Class-wise performance comparison
8. Year-over-year trends
9. Key recommendations for improvement
10. Action items for leadership

Format as an executive summary with key metrics and insights."""

        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='general',
            prompt=prompt,
            status='pending'
        )

        queue_error = _queue_ai_request(ai_request)
        if queue_error:
            return queue_error

        return Response(
            AIRequestSerializer(ai_request).data,
            status=status.HTTP_201_CREATED
        )


class AIInsightViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AIInsightSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]

    def get_queryset(self):
        """Get AI insights based on user role."""
        user = self.request.user
        role = _role(user)
        queryset = AIInsight.objects.filter(is_active=True)

        school = _user_school(user)
        if school:
            queryset = queryset.filter(school=school)

        target_roles = {role, role.lower(), 'all', 'ALL'}
        if role == 'PARENT':
            target_roles.update({'STUDENT', 'student'})
        if role in EXECUTIVE_ROLES:
            target_roles.update({'EXECUTIVE', 'executive'})
        if role in SCHOOL_ADMIN_ROLES:
            target_roles.update({'SCHOOL_ADMIN', 'school_admin', 'principal'})

        target_query = Q()
        for target_role in target_roles:
            target_query |= Q(target_role__icontains=target_role)

        queryset = queryset.filter(target_query)

        return queryset.order_by('-created_at')

    @action(detail=False, methods=['post'], url_path='generate-insights')
    def generate_insights(self, request):
        """Trigger AI insights generation (executives only)."""
        if _role(request.user) not in {*EXECUTIVE_ROLES, *SCHOOL_ADMIN_ROLES}:
            return Response(
                {'error': _('Only executives and school admins can generate insights.')},
                status=status.HTTP_403_FORBIDDEN
            )

        generate_weekly_insights.delay()

        return Response({
            'status': 'Insights generation triggered',
            'message': _('Weekly insights are being generated. Check back shortly.')
        })


from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_quota_view(request):
    """How many questions are left today, for the apps to show up front.

    Read before the first question is typed, so a person sees what they
    have rather than discovering it when they are refused.
    """
    from .quota import chat_quota

    return Response(chat_quota(request.user).as_dict())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AIRateThrottle])
def direct_chat(request):
    """
    Synchronous direct-chat endpoint using Groq API.
    Returns an immediate AI response (no Celery task).
    """
    from .utils import call_groq_api

    from .quota import chat_quota

    message = (request.data.get('message') or '').strip()
    if not message:
        return Response({'error': 'message is required'}, status=status.HTTP_400_BAD_REQUEST)

    # Every answer costs money to produce. A free account gets a few questions
    # a day and is told how many are left before it asks, so running out is
    # never a surprise.
    quota = chat_quota(request.user)
    if quota.exhausted:
        return Response(
            {
                'code': 'ai_quota_exhausted',
                'detail': _(
                    "You have used all %(limit)s of today's questions. "
                    'Upgrade to Pro for more, or come back tomorrow.'
                ) % {'limit': quota.limit},
                'quota': quota.as_dict(),
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    # Optional: include conversation history for context
    history = request.data.get('history', [])

    # Build messages list
    messages = []
    for entry in history[-10:]:  # Last 10 messages for context window
        role = entry.get('role', 'user')
        content = entry.get('content', '')
        if role in ('user', 'assistant') and content:
            messages.append({'role': role, 'content': content})

    # Build the prompt incorporating history as context text
    if messages:
        history_text = '\n'.join(
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
            for m in messages
        )
        full_prompt = f"Previous conversation:\n{history_text}\n\nUser: {message}"
    else:
        full_prompt = message

    grade_keywords = {'grade', 'grades', 'mark', 'marks', 'score', 'scores', 'subject', 'subjects', 'notes', 'moyenne'}
    if _role(request.user) == 'STUDENT' and any(keyword in message.lower() for keyword in grade_keywords):
        student = students_api.get_student_for_user(request.user)
        if student:
            recent_grades = Grade.objects.select_related('subject', 'sequence').filter(student=student).order_by('-created_at')[:12]
            grade_context = [
                {
                    'subject': grade.subject.name if grade.subject else 'Unknown Subject',
                    'score': str(grade.score),
                    'sequence': grade.sequence.name if grade.sequence else '',
                }
                for grade in recent_grades
            ]
            full_prompt = (
                "Use this verified EduIgnite student context when answering. "
                "Do not invent grades or subjects that are not listed.\n"
                f"Student: {student.user.get_full_name()}\n"
                f"Class: {_student_class_name(student)}\n"
                f"Recent grades: {grade_context}\n\n"
                f"{full_prompt}"
            )

    school = _user_school(request.user)
    ai_request = AIRequest.objects.create(
        user=request.user,
        school=school,
        request_type='general',
        prompt=full_prompt,
        status='processing',
    )

    result = call_groq_api(full_prompt, max_tokens=getattr(settings, 'AI_CHAT_MAX_TOKENS', 2400))

    if result['success']:
        ai_request.mark_completed(
            response=result['response'],
            tokens_used=result['tokens_used'],
            processing_time_ms=result['processing_time_ms'],
        )
        return Response({
            'reply': result['response'],
            'tokens_used': result['tokens_used'],
            'processing_time_ms': result['processing_time_ms'],
            # Counted after the fact, so the apps can update without asking.
            'quota': chat_quota(request.user).as_dict(),
        })
    else:
        ai_request.mark_failed(result.get('error', 'AI request failed'))
        return Response(
            {'error': result.get('error', 'AI request failed')},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
