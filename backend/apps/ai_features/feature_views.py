import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Count, F, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .throttles import AIRateThrottle

from apps.assignments.models import Assignment
from apps.exams.models import Exam, ExamQuestion
from apps.grades.models import Sequence, Subject
from apps.schools.models import School, SchoolClass
from apps.students import api as students_api

from .career_export import render_career_docx, render_career_pdf
from .exam_export import render_exam_docx, render_exam_pdf
from .exam_generation import save_draft_questions_to_bank
from .guidance_export import render_guidance_docx, render_guidance_pdf
from .pdf_utils import PdfGenerationError
from .models import (
    AIExamDraft,
    AIExamQuestion,
    AIRequest,
    AcademicRoadmap,
    CareerOrientationReport,
    QuestionBank,
    SkillGapReport,
    StudentGuidanceReport,
)
from .serializers import (
    AIExamDraftSerializer,
    AIExamQuestionSerializer,
    AcademicRoadmapSerializer,
    CareerOrientationReportSerializer,
    QuestionBankSerializer,
    SkillGapReportSerializer,
    StudentGuidanceReportSerializer,
)
from . import credit_engine
from .utils import check_ai_quota
from apps.registry.permissions import RequiresApp


logger = logging.getLogger(__name__)
EXECUTIVE_ROLES = {'SUPER_ADMIN', 'CEO', 'CTO', 'COO', 'INV', 'DESIGNER'}
FOUNDER_ROLES = {'SUPER_ADMIN', 'CEO', 'CTO'}
EXAM_CREATOR_ROLES = {'TEACHER', 'SCHOOL_ADMIN', 'SUB_ADMIN'}
SCHOOL_ADMIN_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}
SCHOOL_STAFF_ROLES = {*SCHOOL_ADMIN_ROLES, 'TEACHER', 'BURSAR', 'LIBRARIAN'}


def _role(user):
    return (getattr(user, 'role', '') or '').upper()


def _user_school(user):
    return getattr(user, 'school', None) if getattr(user, 'school_id', None) else None


def _get_student(identifier):
    return students_api.get_student_by_id_or_user(identifier)


def _can_access_student(user, student):
    role = _role(user)
    if role in FOUNDER_ROLES:
        return True
    if role in SCHOOL_STAFF_ROLES:
        return bool(getattr(user, 'school_id', None) and student.school_id == user.school_id)
    if role == 'STUDENT':
        return student.user_id == user.id
    if role == 'PARENT':
        return students_api.is_guardian_of(user, student)
    return False


def _school_for_request(user, data):
    user_school = _user_school(user)
    if user_school:
        return user_school

    school_id = data.get('school_id')
    if school_id:
        return get_object_or_404(School, id=school_id)

    class_id = data.get('school_class_id')
    if class_id:
        school_class = get_object_or_404(SchoolClass.objects.select_related('school'), id=class_id)
        return school_class.school

    subject_id = data.get('subject_id')
    if subject_id:
        subject = get_object_or_404(Subject.objects.select_related('school'), id=subject_id)
        return subject.school

    return None


def _quota_response(user, request_type, school):
    if check_ai_quota(user, request_type=request_type, school=school):
        return None
    return Response(
        {'error': 'Daily AI limit reached for this feature. Try again tomorrow.'},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


JSON_RESPONSE = {'type': 'json_object'}


def _affordable_estimate(request, feature, **kwargs):
    """Estimate a feature's credits and refuse now if they cannot be paid.

    Runs before anything is created, so a refused request leaves nothing
    behind. The estimate is then held against the AI request once it exists.
    """
    kwargs.setdefault('purpose', feature)
    estimate = credit_engine.estimate_request(feature, **kwargs)
    credit_engine.require_affordable(request.user, estimate, request=request)
    return estimate


def _exam_estimate(request, draft_fields):
    from .exam_generation import _question_token_budget

    question_type = draft_fields.get('question_type') or AIExamDraft.QuestionType.MCQ
    num_mcq = int(draft_fields.get('num_mcq') or 0) if question_type in ('MCQ', 'MIXED') else 0
    num_structural = int(draft_fields.get('num_structural') or 0) if question_type in ('STRUCTURAL', 'MIXED') else 0
    budget = _question_token_budget(num_mcq, num_structural)
    return _affordable_estimate(
        request,
        'ai_exam_generation',
        response_format=JSON_RESPONSE,
        input_tokens=700,
        expected_output_tokens=int(budget * 0.8),
        max_output_tokens=budget,
    )


BACKGROUND_WORKER_ERROR = (
    'AI background worker is unavailable. Please make sure Redis and the Celery worker '
    'are running, then try again.'
)
MANDATORY_INLINE_AI_FEATURES = {'ai_exam_generation', 'career_orientation'}


def _mark_background_failure(target, error_message):
    message = BACKGROUND_WORKER_ERROR if not error_message else f'{BACKGROUND_WORKER_ERROR} ({error_message})'
    if isinstance(target, AIExamDraft):
        target.status = AIExamDraft.Status.FAILED
        target.generation_error = message
        target.save(update_fields=['status', 'generation_error', 'updated_at'])
    elif target is not None and hasattr(target, 'status'):
        target.status = 'failed'
        if hasattr(target, 'error_message'):
            target.error_message = message
            target.save(update_fields=['status', 'error_message', 'updated_at'])
        else:
            target.save(update_fields=['status', 'updated_at'])
    ai_request = getattr(target, 'ai_request', None)
    if ai_request:
        ai_request.mark_failed(message)


def _target_request_type(target):
    ai_request = getattr(target, 'ai_request', None)
    if ai_request:
        return getattr(ai_request, 'request_type', '') or ''
    return ''


def _format_questions_for_assignment(draft, questions):
    lines = []
    if draft.instructions:
        lines.extend(['Instructions:', draft.instructions.strip(), ''])
    for question in questions:
        lines.append(f'{question.order}. {question.text} ({question.marks} mark{"s" if question.marks != 1 else ""})')
        if question.kind == AIExamQuestion.QuestionKind.MCQ and question.options:
            for option_index, option in enumerate(question.options):
                lines.append(f'   {chr(65 + option_index)}. {option}')
        if question.expected_answer:
            lines.append(f'   Expected answer guide: {question.expected_answer}')
        if question.marking_guide:
            lines.append(f'   Marking guide: {question.marking_guide}')
        lines.append('')
    return '\n'.join(lines).strip()


def _enqueue(task, *args, target=None, fallback=None):
    try:
        request_type = _target_request_type(target)
        inline_fast_features = set(getattr(settings, 'AI_INLINE_FAST_FEATURES', [])) | MANDATORY_INLINE_AI_FEATURES
        if fallback and request_type in inline_fast_features:
            logger.info('Running AI task %s inline for fast feature %s', task.name, request_type)
            fallback()
            return True

        if settings.CELERY_TASK_ALWAYS_EAGER and not getattr(settings, 'AI_ALLOW_SYNC_FALLBACK', False):
            raise RuntimeError('CELERY_TASK_ALWAYS_EAGER is enabled, which would run this AI job inside the web request.')
        task.apply_async(args=args, retry=False)
        return True
    except Exception as exc:  # noqa: BLE001 - convert broker/config failure into a fast API response.
        logger.exception('Unable to enqueue AI task %s', task.name)
        if getattr(settings, 'AI_ALLOW_SYNC_FALLBACK', False) and fallback:
            fallback()
            return True
        _mark_background_failure(target, str(exc))
        return False


class AIExamDraftViewSet(viewsets.ModelViewSet):
    serializer_class = AIExamDraftSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]
    throttle_classes = [AIRateThrottle]

    def get_queryset(self):
        user = self.request.user
        role = _role(user)
        queryset = AIExamDraft.objects.select_related(
            'school',
            'created_by',
            'reviewed_by',
            'subject',
            'school_class',
            'school_class__sub_school',
            'exam',
            'ai_request',
        ).prefetch_related('questions').annotate(question_count=Count('questions'))

        if role in EXAM_CREATOR_ROLES and getattr(user, 'school_id', None):
            if role in SCHOOL_ADMIN_ROLES:
                return queryset.filter(school_id=user.school_id)
            return queryset.filter(school_id=user.school_id, created_by=user)
        return queryset.none()

    def _can_manage_draft(self, draft):
        role = _role(self.request.user)
        if role in SCHOOL_ADMIN_ROLES and getattr(self.request.user, 'school_id', None) == draft.school_id:
            return True
        return role == 'TEACHER' and draft.created_by_id == self.request.user.id

    def create(self, request, *args, **kwargs):
        if _role(request.user) not in EXAM_CREATOR_ROLES:
            return Response({'error': 'Only teachers, school admins, and sub admins can generate AI exams or assignments.'}, status=403)

        school = _school_for_request(request.user, request.data)
        if not school:
            return Response({'school_id': 'A school is required for AI exam generation.'}, status=400)

        quota = _quota_response(request.user, 'ai_exam_generation', school)
        if quota:
            return quota

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subject = None
        school_class = None

        subject_id = serializer.validated_data.pop('subject_id', None)
        if subject_id:
            subject = get_object_or_404(Subject, id=subject_id, school=school)

        class_id = serializer.validated_data.pop('school_class_id', None)
        if class_id:
            school_class = get_object_or_404(SchoolClass.objects.select_related('school'), id=class_id, school=school)

        estimate = _exam_estimate(request, serializer.validated_data)
        prompt = f"Generate AI exam draft: {serializer.validated_data.get('title')} for {school.name}"
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='ai_exam_generation',
            prompt=prompt,
            status='pending',
        )
        credit_engine.hold_for_request(ai_request, estimate)
        draft = AIExamDraft.objects.create(
            school=school,
            created_by=request.user,
            subject=subject,
            school_class=school_class,
            ai_request=ai_request,
            **serializer.validated_data,
        )

        from .exam_generation import generate_exam_questions
        from .tasks import generate_exam_questions_task

        if not _enqueue(generate_exam_questions_task, str(draft.id), target=draft, fallback=lambda: generate_exam_questions(draft)):
            return Response({'id': str(draft.id), 'status': 'FAILED', 'error': BACKGROUND_WORKER_ERROR}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(draft).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def questions(self, request, pk=None):
        draft = self.get_object()
        if request.method == 'GET':
            return Response(AIExamQuestionSerializer(draft.questions.all(), many=True).data)
        if not self._can_manage_draft(draft):
            return Response({'error': 'You do not have permission to edit this draft.'}, status=403)
        next_order = (draft.questions.aggregate(max_order=Max('order'))['max_order'] or 0) + 1
        serializer = AIExamQuestionSerializer(data={**request.data, 'order': request.data.get('order') or next_order})
        serializer.is_valid(raise_exception=True)
        question = serializer.save(draft=draft, is_edited=True)
        return Response(AIExamQuestionSerializer(question).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'delete'], url_path=r'questions/(?P<question_id>[^/.]+)')
    def question_detail(self, request, pk=None, question_id=None):
        draft = self.get_object()
        if not self._can_manage_draft(draft):
            return Response({'error': 'You do not have permission to edit this draft.'}, status=403)
        question = get_object_or_404(AIExamQuestion, id=question_id, draft=draft)
        if request.method == 'DELETE':
            question.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = AIExamQuestionSerializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        draft = self.get_object()
        if not self._can_manage_draft(draft):
            return Response({'error': 'You do not have permission to regenerate this draft.'}, status=403)

        quota = _quota_response(request.user, 'ai_exam_generation', draft.school)
        if quota:
            return quota

        estimate = _exam_estimate(request, {
            'question_type': draft.question_type,
            'num_mcq': draft.num_mcq,
            'num_structural': draft.num_structural,
        })
        # Each generation is its own AI request, so each is charged once, for
        # itself, and the earlier one's record stays as it was.
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=draft.school,
            request_type='ai_exam_generation',
            prompt=f'Regenerate AI exam draft: {draft.title}',
            status='pending',
        )
        credit_engine.hold_for_request(ai_request, estimate)

        draft.questions.all().delete()
        draft.status = AIExamDraft.Status.DRAFT
        draft.generation_error = ''
        draft.ai_request = ai_request
        draft.save(update_fields=['status', 'generation_error', 'ai_request', 'updated_at'])

        from .exam_generation import generate_exam_questions
        from .tasks import generate_exam_questions_task

        if not _enqueue(generate_exam_questions_task, str(draft.id), target=draft, fallback=lambda: generate_exam_questions(draft)):
            return Response({'id': str(draft.id), 'status': 'FAILED', 'error': BACKGROUND_WORKER_ERROR}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(draft).data)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        draft = self.get_object()
        if not self._can_manage_draft(draft):
            return Response({'error': 'You do not have permission to review this draft.'}, status=403)
        if not draft.questions.exists():
            return Response({'error': 'At least one question is required before review.'}, status=400)
        draft.status = AIExamDraft.Status.REVIEWED
        draft.reviewed_by = request.user
        draft.reviewed_at = timezone.now()
        draft.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'updated_at'])
        save_draft_questions_to_bank(draft)
        return Response(self.get_serializer(draft).data)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        draft = self.get_object()
        if not self._can_manage_draft(draft):
            return Response({'error': 'You do not have permission to publish this draft.'}, status=403)
        if draft.status != AIExamDraft.Status.REVIEWED:
            return Response({'error': 'AI exams must be reviewed before publishing.'}, status=400)
        questions = list(draft.questions.all())
        if not questions:
            return Response({'error': 'At least one question is required before publishing.'}, status=400)
        if draft.publish_target == AIExamDraft.PublishTarget.EXAM and draft.exam_mode == AIExamDraft.ExamMode.ONLINE and any(question.kind != 'MCQ' for question in questions):
            return Response({'error': 'Online exams can only publish MCQ questions. Use on-site mode for structural exams.'}, status=400)

        with transaction.atomic():
            # A school admin or sub-admin who also teaches (teacher capability)
            # is recorded as the author, just like a teacher, so an exam or
            # assignment they generate is attributed to them rather than to no one.
            def _teaching(user):
                return user if (user and getattr(user, 'has_capability', None)
                                and user.has_capability('TEACHER')) else None
            teacher = _teaching(request.user) or _teaching(draft.created_by)
            if draft.publish_target == AIExamDraft.PublishTarget.ASSIGNMENT:
                if not draft.subject_id or not draft.school_class_id:
                    return Response({'error': 'A subject and class are required before publishing an AI draft as an assignment.'}, status=400)
                if not draft.assignment_due_date:
                    return Response({'assignment_due_date': 'Set the exact assignment deadline before publishing.'}, status=400)
                if draft.assignment_due_date <= timezone.now():
                    return Response({'assignment_due_date': 'The assignment deadline must be in the future.'}, status=400)

                assignment = Assignment.objects.create(
                    school=draft.school,
                    subject=draft.subject,
                    teacher=teacher,
                    school_class=draft.school_class,
                    title=draft.title,
                    instructions=_format_questions_for_assignment(draft, questions),
                    target_class=draft.school_class.name,
                    due_date=draft.assignment_due_date,
                    max_marks=min(sum(question.marks for question in questions) or 20, 100),
                    submission_type=Assignment.SubmissionType.BOTH,
                    status=Assignment.Status.PUBLISHED,
                )
                draft.assignment = assignment
                response_payload = {'assignment_id': str(assignment.id)}
            else:
                if not draft.start_time:
                    return Response({'start_time': 'Set the exact exam start date and time before publishing.'}, status=400)
                if draft.start_time <= timezone.now():
                    return Response({'start_time': 'The exam start time must be in the future.'}, status=400)

                exam = Exam.objects.create(
                    school=draft.school,
                    subject=draft.subject,
                    teacher=teacher,
                    school_class=draft.school_class,
                    title=draft.title,
                    exam_type=Exam.ExamType.SEQUENCE,
                    mode=draft.exam_mode,
                    target_class=draft.school_class.name if draft.school_class else draft.title,
                    instructions=draft.instructions,
                    start_time=draft.start_time,
                    duration_minutes=draft.duration_minutes,
                    status=Exam.Status.SCHEDULED,
                )
                if draft.exam_mode == AIExamDraft.ExamMode.ONLINE:
                    for question in questions:
                        ExamQuestion.objects.create(
                            exam=exam,
                            order=question.order,
                            text=question.text,
                            options=question.options,
                            correct_option=question.correct_option,
                            marks=question.marks,
                            explanation=question.explanation,
                        )
                draft.exam = exam
                response_payload = {'exam_id': str(exam.id)}
            draft.status = AIExamDraft.Status.PUBLISHED
            draft.save(update_fields=['exam', 'assignment', 'status', 'updated_at'])
            save_draft_questions_to_bank(draft)

        return Response({**response_payload, 'draft': self.get_serializer(draft).data})

    @action(detail=True, methods=['get'], url_path='export/pdf')
    def export_pdf(self, request, pk=None):
        draft = self.get_object()
        if not draft.questions.exists():
            return Response({'error': 'No questions are available to export yet.'}, status=400)
        try:
            return render_exam_pdf(draft)
        except (ImportError, PdfGenerationError):
            return Response(
                {'error': 'PDF generation is unavailable on the server. Please try the Word (DOCX) export instead.'},
                status=503,
            )

    @action(detail=True, methods=['get'], url_path='export/docx')
    def export_docx(self, request, pk=None):
        draft = self.get_object()
        if not draft.questions.exists():
            return Response({'error': 'No questions are available to export yet.'}, status=400)
        try:
            return render_exam_docx(draft)
        except ImportError:
            return Response({'error': 'python-docx is not installed on the server.'}, status=503)


class QuestionBankViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = QuestionBankSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]

    def get_queryset(self):
        user = self.request.user
        queryset = QuestionBank.objects.select_related('school', 'source_draft')
        if _role(user) not in EXAM_CREATOR_ROLES or not getattr(user, 'school_id', None):
            return queryset.none()
        queryset = queryset.filter(school_id=user.school_id)

        params = self.request.query_params
        if params.get('subject'):
            queryset = queryset.filter(subject_name__icontains=params['subject'])
        if params.get('class_level'):
            queryset = queryset.filter(class_level__icontains=params['class_level'])
        if params.get('difficulty'):
            queryset = queryset.filter(difficulty=params['difficulty'])
        if params.get('kind'):
            queryset = queryset.filter(kind=params['kind'])
        if params.get('search'):
            queryset = queryset.filter(text__icontains=params['search'])
        return queryset.order_by('-created_at')

    @action(detail=False, methods=['post'], url_path='import')
    def import_questions(self, request):
        draft = get_object_or_404(AIExamDraft, id=request.data.get('draft_id'))
        question_ids = request.data.get('question_ids') or []
        if not isinstance(question_ids, list) or not question_ids:
            return Response({'question_ids': 'Select at least one question.'}, status=400)
        role = _role(request.user)
        if role not in EXAM_CREATOR_ROLES or draft.school_id != getattr(request.user, 'school_id', None):
            return Response({'error': 'You do not have permission to modify this draft.'}, status=403)
        if role == 'TEACHER' and draft.created_by_id != request.user.id:
            return Response({'error': 'You do not have permission to modify this draft.'}, status=403)

        imported = 0
        next_order = draft.questions.count() + 1
        for item in QuestionBank.objects.filter(id__in=question_ids, school=draft.school):
            AIExamQuestion.objects.create(
                draft=draft,
                order=next_order,
                kind='MCQ' if item.kind == QuestionBank.Kind.MCQ else 'THEORY',
                text=item.text,
                options=item.options,
                correct_option=item.correct_option or 0,
                expected_answer=item.expected_answer,
                marking_guide=item.marking_guide,
                marks=item.marks,
                is_edited=True,
            )
            item.use_count = F('use_count') + 1
            item.save(update_fields=['use_count', 'updated_at'])
            imported += 1
            next_order += 1
        return Response({'imported': imported})


class CareerOrientationReportViewSet(viewsets.ModelViewSet):
    serializer_class = CareerOrientationReportSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]
    throttle_classes = [AIRateThrottle]

    def get_queryset(self):
        user = self.request.user
        queryset = CareerOrientationReport.objects.select_related('student', 'student__user', 'student__school', 'user')
        role = _role(user)
        if role in FOUNDER_ROLES:
            return queryset
        if role in SCHOOL_STAFF_ROLES and getattr(user, 'school_id', None):
            return queryset.filter(Q(user=user) | Q(student__school_id=user.school_id))
        if role == 'PARENT':
            child_ids = students_api.list_student_ids_for_guardian(user)
            return queryset.filter(Q(user=user) | Q(student_id__in=child_ids))
        return queryset.filter(user=user)

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        student = _get_student(data.get('student')) if data.get('student') else None
        if not student and _role(request.user) == 'STUDENT':
            student = students_api.get_student_for_user(request.user)
            if student:
                data['student'] = str(student.id)
        if student and not _can_access_student(request.user, student):
            return Response({'error': 'You do not have permission to access this student.'}, status=403)
        school = student.school if student else _user_school(request.user)
        quota = _quota_response(request.user, 'career_orientation', school)
        if quota:
            return quota
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        estimate = _affordable_estimate(
            request, 'career_orientation', response_format=JSON_RESPONSE, max_output_tokens=1400,
        )
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=school,
            request_type='career_orientation',
            prompt=f"Career orientation: {serializer.validated_data['desired_career']}",
            status='pending',
        )
        credit_engine.hold_for_request(ai_request, estimate)
        report = serializer.save(user=request.user, ai_request=ai_request, status='pending')
        from .career_service import generate_career_report

        generate_career_report(report)
        report.refresh_from_db()
        response_status = 'COMPLETED' if report.status == 'completed' else 'FAILED' if report.status == 'failed' else 'PROCESSING'
        return Response(
            {
                'id': str(report.id),
                'status': response_status,
                'report_data': report.report_data or None,
                'error': report.error_message,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        report = self.get_object()
        response_status = 'COMPLETED' if report.status == 'completed' else 'FAILED' if report.status == 'failed' else 'PROCESSING'
        return Response({'status': response_status, 'report_data': report.report_data or None, 'error': report.error_message})

    @action(detail=True, methods=['get'], url_path='export/pdf')
    def export_pdf(self, request, pk=None):
        report = self.get_object()
        if report.status != 'completed':
            return Response({'error': 'Career report is not ready yet.'}, status=400)
        try:
            return render_career_pdf(report)
        except (ImportError, PdfGenerationError):
            return Response(
                {'error': 'PDF generation is unavailable on the server. Please try the Word (DOCX) export instead.'},
                status=503,
            )

    @action(detail=True, methods=['get'], url_path='export/docx')
    def export_docx(self, request, pk=None):
        report = self.get_object()
        if report.status != 'completed':
            return Response({'error': 'Career report is not ready yet.'}, status=400)
        try:
            return render_career_docx(report)
        except ImportError:
            return Response({'error': 'python-docx is not installed on the server.'}, status=503)


class AcademicRoadmapViewSet(viewsets.ModelViewSet):
    serializer_class = AcademicRoadmapSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]
    throttle_classes = [AIRateThrottle]

    def get_queryset(self):
        user = self.request.user
        queryset = AcademicRoadmap.objects.select_related('student', 'student__user', 'student__school', 'ai_request')
        if _role(user) in FOUNDER_ROLES:
            return queryset
        if _role(user) in SCHOOL_STAFF_ROLES and getattr(user, 'school_id', None):
            return queryset.filter(student__school_id=user.school_id)
        if _role(user) == 'PARENT':
            child_ids = students_api.list_student_ids_for_guardian(user)
            return queryset.filter(student_id__in=child_ids)
        return queryset.filter(student__user=user)

    def create(self, request, *args, **kwargs):
        student = _get_student(request.data.get('student') or request.data.get('student_id'))
        if not student:
            return Response({'student_id': 'Student not found.'}, status=404)
        if not _can_access_student(request.user, student):
            return Response({'error': 'You do not have permission to access this student.'}, status=403)
        quota = _quota_response(request.user, 'academic_roadmap', student.school)
        if quota:
            return quota
        data = request.data.copy()
        data['student'] = str(student.id)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        estimate = _affordable_estimate(request, 'academic_roadmap', max_output_tokens=2200)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=student.school,
            request_type='academic_roadmap',
            prompt='Academic roadmap generation',
            status='pending',
        )
        credit_engine.hold_for_request(ai_request, estimate)
        roadmap = serializer.save(ai_request=ai_request, status='pending')
        from .roadmap_service import generate_academic_roadmap
        from .tasks import generate_academic_roadmap_task

        if not _enqueue(generate_academic_roadmap_task, str(roadmap.id), target=roadmap, fallback=lambda: generate_academic_roadmap(roadmap)):
            return Response({'id': str(roadmap.id), 'status': 'FAILED', 'error': BACKGROUND_WORKER_ERROR}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'id': str(roadmap.id), 'status': 'PROCESSING'}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        roadmap = self.get_object()
        response_status = 'COMPLETED' if roadmap.status == 'completed' else 'FAILED' if roadmap.status == 'failed' else 'PROCESSING'
        return Response({'status': response_status, 'roadmap_data': roadmap.roadmap_data or None, 'error': roadmap.error_message})


class SkillGapReportViewSet(viewsets.ModelViewSet):
    serializer_class = SkillGapReportSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]
    throttle_classes = [AIRateThrottle]

    def get_queryset(self):
        user = self.request.user
        queryset = SkillGapReport.objects.select_related('student', 'student__user', 'student__school', 'sequence', 'ai_request')
        if _role(user) in FOUNDER_ROLES:
            return queryset
        if _role(user) in SCHOOL_STAFF_ROLES and getattr(user, 'school_id', None):
            return queryset.filter(student__school_id=user.school_id)
        if _role(user) == 'PARENT':
            child_ids = students_api.list_student_ids_for_guardian(user)
            return queryset.filter(student_id__in=child_ids)
        return queryset.filter(student__user=user)

    def create(self, request, *args, **kwargs):
        student = _get_student(request.data.get('student') or request.data.get('student_id'))
        if not student:
            return Response({'student_id': 'Student not found.'}, status=404)
        if not _can_access_student(request.user, student):
            return Response({'error': 'You do not have permission to access this student.'}, status=403)
        quota = _quota_response(request.user, 'skill_gap_analysis', student.school)
        if quota:
            return quota
        sequence_id = request.data.get('sequence') or request.data.get('sequence_id')
        sequence = None
        if sequence_id:
            sequence = get_object_or_404(Sequence, id=sequence_id, school=student.school)
        else:
            sequence = Sequence.objects.filter(school=student.school).order_by('-academic_year', '-term', '-created_at').first()
        estimate = _affordable_estimate(request, 'skill_gap_analysis', max_output_tokens=2000)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=student.school,
            request_type='skill_gap_analysis',
            prompt='Skill gap analysis',
            status='pending',
        )
        credit_engine.hold_for_request(ai_request, estimate)
        report = SkillGapReport.objects.create(student=student, sequence=sequence, ai_request=ai_request, status='pending')
        from .skill_gap_service import generate_skill_gap_report
        from .tasks import generate_skill_gap_report_task

        if not _enqueue(generate_skill_gap_report_task, str(report.id), target=report, fallback=lambda: generate_skill_gap_report(report)):
            return Response({'id': str(report.id), 'status': 'FAILED', 'error': BACKGROUND_WORKER_ERROR}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'id': str(report.id), 'status': 'PROCESSING'}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        report = self.get_object()
        response_status = 'COMPLETED' if report.status == 'completed' else 'FAILED' if report.status == 'failed' else 'PROCESSING'
        return Response({'status': response_status, 'analysis_data': report.analysis_data or None, 'error': report.error_message})


class StudentGuidanceReportViewSet(viewsets.ModelViewSet):
    serializer_class = StudentGuidanceReportSerializer
    permission_classes = [IsAuthenticated, RequiresApp('ai_features')]
    throttle_classes = [AIRateThrottle]

    def get_queryset(self):
        user = self.request.user
        queryset = StudentGuidanceReport.objects.select_related('student', 'student__user', 'student__school', 'generated_by', 'ai_request')
        if _role(user) in FOUNDER_ROLES:
            return queryset
        if _role(user) in SCHOOL_STAFF_ROLES and getattr(user, 'school_id', None):
            return queryset.filter(student__school_id=user.school_id)
        if _role(user) == 'PARENT':
            child_ids = students_api.list_student_ids_for_guardian(user)
            return queryset.filter(student_id__in=child_ids)
        return queryset.filter(student__user=user)

    def create(self, request, *args, **kwargs):
        student = _get_student(request.data.get('student') or request.data.get('student_id'))
        if not student:
            return Response({'student_id': 'Student not found.'}, status=404)
        if not _can_access_student(request.user, student):
            return Response({'error': 'You do not have permission to access this student.'}, status=403)
        quota = _quota_response(request.user, 'student_guidance', student.school)
        if quota:
            return quota
        data = request.data.copy()
        data['student'] = str(student.id)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        estimate = _affordable_estimate(request, 'student_guidance', max_output_tokens=2200)
        ai_request = AIRequest.objects.create(
            user=request.user,
            school=student.school,
            request_type='student_guidance',
            prompt='Student guidance report',
            status='pending',
        )
        credit_engine.hold_for_request(ai_request, estimate)
        report = serializer.save(generated_by=request.user, ai_request=ai_request, status='pending')
        from .guidance_service import generate_student_guidance_report
        from .tasks import generate_student_guidance_report_task

        if not _enqueue(generate_student_guidance_report_task, str(report.id), target=report, fallback=lambda: generate_student_guidance_report(report)):
            return Response({'id': str(report.id), 'status': 'FAILED', 'error': BACKGROUND_WORKER_ERROR}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'id': str(report.id), 'status': 'PROCESSING'}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        report = self.get_object()
        response_status = 'COMPLETED' if report.status == 'completed' else 'FAILED' if report.status == 'failed' else 'PROCESSING'
        return Response({'status': response_status, 'report_data': report.report_data or None, 'error': report.error_message})

    @action(detail=True, methods=['get'], url_path='export/pdf')
    def export_pdf(self, request, pk=None):
        report = self.get_object()
        if report.status != 'completed':
            return Response({'error': 'Guidance report is not ready yet.'}, status=400)
        try:
            return render_guidance_pdf(report)
        except (ImportError, PdfGenerationError):
            return Response(
                {'error': 'PDF generation is unavailable on the server. Please try the Word (DOCX) export instead.'},
                status=503,
            )

    @action(detail=True, methods=['get'], url_path='export/docx')
    def export_docx(self, request, pk=None):
        report = self.get_object()
        if report.status != 'completed':
            return Response({'error': 'Guidance report is not ready yet.'}, status=400)
        try:
            return render_guidance_docx(report)
        except ImportError:
            return Response({'error': 'python-docx is not installed on the server.'}, status=503)
