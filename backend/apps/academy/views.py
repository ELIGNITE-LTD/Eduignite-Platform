import uuid

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import UserRole

from .models import (
    AcademyPermission,
    Certificate,
    Course,
    CourseEnrollment,
    CourseTestimonial,
    DeepLinkCache,
    FAQEntry,
    Lesson,
    LessonProgress,
    ProfileConfig,
    Quiz,
    QuizAttempt,
    TrainerProfile,
)
from .permissions import HasAcademyScope, user_has_scope
from .serializers import (
    AcademyPermissionSerializer,
    AcademyRegisterSerializer,
    CertificateVerifySerializer,
    CourseDetailSerializer,
    CourseListSerializer,
    CoursePlayerSerializer,
    CourseTestimonialCreateSerializer,
    CourseTestimonialSerializer,
    CourseWriteSerializer,
    DeepLinkCreateSerializer,
    FAQEntrySerializer,
    MyCertificateSerializer,
    PermissionGrantSerializer,
    ProfileConfigSerializer,
    QuizAttemptSubmitSerializer,
    QuizQuestionPublicSerializer,
    TrainerProfileSerializer,
    TrainerProfileWriteSerializer,
)
from .services import (
    ensure_academy_profile,
    get_active_deep_link,
    log_academy_action,
    recommended_course_slugs_for_role,
    sync_trainer_profile,
)

User = get_user_model()

# Only a COURSE_APPROVE holder (CEO tier) may grant/revoke these two scopes
# themselves — otherwise a COURSE_ASSIGN holder could mint more CEO-tier
# authority. Not spelled out by the spec; documented assumption per the
# contract's own note on this edge case.
CEO_ONLY_SCOPES = {AcademyPermission.Scope.COURSE_ASSIGN, AcademyPermission.Scope.COURSE_APPROVE}


# ---------------------------------------------------------------------------
# Public profile / stats
# ---------------------------------------------------------------------------

class AcademyProfilePublicView(APIView):
    """GET /api/v1/academy/profile/ — public, no auth."""

    permission_classes = [permissions.AllowAny]
    CACHE_KEY = 'academy:public_profile'
    CACHE_SECONDS = 60

    def get(self, request):
        # AllowAny, no auth -- every anonymous hit ran 3 queries with zero
        # caching. Short TTL: bounds staleness without needing invalidation
        # hooks on every course-publish/certificate-issue code path.
        data = cache.get(self.CACHE_KEY)
        if data is None:
            config = ProfileConfig.load()
            courses_count = (
                config.courses_count_override
                if config.courses_count_override is not None
                else Course.objects.filter(status=Course.Status.PUBLISHED).count()
            )
            learners_count = (
                config.learners_count_override
                if config.learners_count_override is not None
                else CourseEnrollment.objects.values('user_id').distinct().count()
            )
            certificates_count = (
                config.certificates_count_override
                if config.certificates_count_override is not None
                else Certificate.objects.count()
            )
            data = {
                'tagline': config.tagline,
                'mission': config.mission,
                'vision': config.vision,
                'description': config.description,
                'logo_url': config.logo_url,
                'stats': {
                    'courses_count': courses_count,
                    'learners_count': learners_count,
                    'certificates_count': certificates_count,
                },
            }
            cache.set(self.CACHE_KEY, data, self.CACHE_SECONDS)
        return Response(data)


class ProfileConfigUpdateView(APIView):
    """PUT /api/v1/academy/profile-config/ — requires PROFILE_EDIT."""

    permission_classes = [permissions.IsAuthenticated, HasAcademyScope(AcademyPermission.Scope.PROFILE_EDIT)]

    def put(self, request):
        config = ProfileConfig.load()
        serializer = ProfileConfigSerializer(config, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_academy_action(request, action='profile_config.update', entity='ProfileConfig:1')
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

class CourseViewSet(viewsets.ModelViewSet):
    lookup_field = 'slug'
    lookup_value_regex = '[^/]+'

    def get_queryset(self):
        qs = Course.objects.select_related('created_by', 'assigned_by', 'approved_by').prefetch_related(
            'modules__lessons', 'resources', 'testimonials',
        )
        if self.action == 'list':
            user = self.request.user
            mine = self.request.query_params.get('mine')
            status_param = self.request.query_params.get('status')
            if user.is_authenticated and mine == 'true':
                qs = qs.filter(created_by=user)
            elif (
                user.is_authenticated
                and status_param
                and user_has_scope(user, AcademyPermission.Scope.COURSE_APPROVE)
            ):
                qs = qs.filter(status=status_param)
            else:
                qs = qs.filter(status=Course.Status.PUBLISHED)

            role_pathway = self.request.query_params.get('role_pathway')
            if role_pathway:
                qs = qs.filter(role_pathway=role_pathway)
            if self.request.query_params.get('featured') == 'true':
                qs = qs.filter(is_featured=True)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return CourseListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return CourseWriteSerializer
        if self.action == 'player':
            return CoursePlayerSerializer
        return CourseDetailSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.AllowAny()]
        if self.action == 'create':
            return [permissions.IsAuthenticated(), HasAcademyScope(AcademyPermission.Scope.COURSE_CREATE)()]
        if self.action in ('approve', 'reject'):
            return [permissions.IsAuthenticated(), HasAcademyScope(AcademyPermission.Scope.COURSE_APPROVE)()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        course = serializer.save()
        # Auto-build/refresh the creator's TrainerProfile the moment they
        # author a course, instead of requiring a PROFILE_EDIT holder to
        # manually add every trainer to the CMS first — see
        # sync_trainer_profile()'s own docstring for exactly what it does
        # and does not overwrite.
        sync_trainer_profile(course.created_by)

    def retrieve(self, request, *args, **kwargs):
        course = self.get_object()
        if course.status != Course.Status.PUBLISHED:
            user = request.user
            is_owner_or_approver = user.is_authenticated and (
                course.created_by_id == user.id or user_has_scope(user, AcademyPermission.Scope.COURSE_APPROVE)
            )
            if not is_owner_or_approver:
                from django.http import Http404
                raise Http404
        serializer = self.get_serializer(course)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        course = self.get_object()
        if course.created_by_id != request.user.id and not user_has_scope(
            request.user, AcademyPermission.Scope.COURSE_APPROVE,
        ):
            return Response({'detail': 'You do not have permission to edit this course.'}, status=status.HTTP_403_FORBIDDEN)
        # is_featured is the CMS's "Course Spotlight" toggle -- PROFILE_EDIT
        # territory, not something a course's own creator/approver should be
        # able to flip on themselves just by owning/approving the course.
        if 'is_featured' in request.data and bool(request.data.get('is_featured')) != course.is_featured:
            if not user_has_scope(request.user, AcademyPermission.Scope.PROFILE_EDIT):
                return Response(
                    {'detail': 'Featuring/unfeaturing a course requires the PROFILE_EDIT scope.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        course = self.get_object()
        is_approver = user_has_scope(request.user, AcademyPermission.Scope.COURSE_APPROVE)
        is_owner_of_draft = course.created_by_id == request.user.id and course.status == Course.Status.DRAFT
        if not (is_approver or is_owner_of_draft):
            return Response({'detail': 'You do not have permission to delete this course.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def enroll(self, request, slug=None):
        course = self.get_object()
        if course.status != Course.Status.PUBLISHED:
            return Response({'detail': 'This course is not published yet.'}, status=status.HTTP_400_BAD_REQUEST)
        ensure_academy_profile(request.user)
        had_pre_existing_school_os_role = request.user.role != UserRole.ACADEMY_LEARNER
        source = CourseEnrollment.Source.SSO if had_pre_existing_school_os_role else CourseEnrollment.Source.DIRECT
        enrollment, created = CourseEnrollment.objects.get_or_create(
            user=request.user, course=course, defaults={'source': source},
        )
        return Response(
            {'enrolled': True, 'source': enrollment.source, 'enrolled_at': enrollment.enrolled_at},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'])
    def player(self, request, slug=None):
        course = self.get_object()
        enrollment = CourseEnrollment.objects.filter(user=request.user, course=course).first()
        if enrollment is None:
            return Response(
                {'detail': 'You must enroll in this course before you can access the player.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        progress_by_lesson = {
            row.lesson_id: row.completed_at is not None
            for row in LessonProgress.objects.filter(enrollment=enrollment)
        }
        serializer = CoursePlayerSerializer(course, context={'progress_by_lesson': progress_by_lesson, 'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='submit-for-review')
    def submit_for_review(self, request, slug=None):
        course = self.get_object()
        if course.created_by_id != request.user.id and not user_has_scope(
            request.user, AcademyPermission.Scope.COURSE_APPROVE,
        ):
            return Response({'detail': 'Only the course creator can submit this for review.'}, status=status.HTTP_403_FORBIDDEN)
        if course.status != Course.Status.DRAFT:
            return Response(
                {'detail': f'Course must be in DRAFT status to submit for review (currently {course.status}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Self-approve shortcut: a COURSE_APPROVE holder (CEO/CTO tier — see
        # founder-parity rule, checked by scope, never by `role == 'CEO'`)
        # submitting their OWN course doesn't need to wait on themselves.
        # Skip PENDING_REVIEW entirely and publish immediately, mirroring the
        # `approve` action below exactly. Anyone who only holds COURSE_CREATE
        # (e.g. COO, or any other assigned Course Creator) keeps the existing
        # DRAFT -> PENDING_REVIEW -> (founder) approve flow unchanged.
        if user_has_scope(request.user, AcademyPermission.Scope.COURSE_APPROVE):
            course.status = Course.Status.PUBLISHED
            course.approved_by = request.user
            course.approved_at = timezone.now()
            course.save(update_fields=['status', 'approved_by', 'approved_at'])
            log_academy_action(request, action='course.approve', entity=f'Course:{course.id}')
            sync_trainer_profile(course.created_by)  # published-course count just changed
            return Response(CourseDetailSerializer(course).data)
        course.status = Course.Status.PENDING_REVIEW
        course.save(update_fields=['status'])
        return Response(CourseDetailSerializer(course).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, slug=None):
        """The ONLY OTHER path a course may reach PUBLISHED besides the
        COURSE_APPROVE self-approve shortcut in `submit_for_review` above —
        never the generic update endpoint, which has no writable `status`
        field at all."""
        course = self.get_object()
        if course.status == Course.Status.PUBLISHED:
            return Response({'detail': 'Course is already published.'}, status=status.HTTP_400_BAD_REQUEST)
        course.status = Course.Status.PUBLISHED
        course.approved_by = request.user
        course.approved_at = timezone.now()
        course.save(update_fields=['status', 'approved_by', 'approved_at'])
        log_academy_action(request, action='course.approve', entity=f'Course:{course.id}')
        sync_trainer_profile(course.created_by)  # published-course count just changed
        return Response(CourseDetailSerializer(course).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, slug=None):
        course = self.get_object()
        course.status = Course.Status.DRAFT
        course.save(update_fields=['status'])
        log_academy_action(request, action='course.reject', entity=f'Course:{course.id}')
        return Response(CourseDetailSerializer(course).data)


# ---------------------------------------------------------------------------
# Trainers / FAQ / Testimonials (CMS-managed public content)
# ---------------------------------------------------------------------------

class TrainerProfileViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = TrainerProfile.objects.select_related('user')
        if self.action == 'list' and not user_has_scope(self.request.user, AcademyPermission.Scope.PROFILE_EDIT):
            qs = qs.filter(is_verified=True)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return TrainerProfileWriteSerializer
        return TrainerProfileSerializer

    def get_permissions(self):
        if self.action == 'list':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), HasAcademyScope(AcademyPermission.Scope.PROFILE_EDIT)()]


class FAQEntryViewSet(viewsets.ModelViewSet):
    queryset = FAQEntry.objects.all()
    serializer_class = FAQEntrySerializer

    def get_permissions(self):
        if self.action == 'list':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), HasAcademyScope(AcademyPermission.Scope.PROFILE_EDIT)()]

    def list(self, request, *args, **kwargs):
        """Grouped by category per the contract ({category: [faqs]})."""
        grouped = {}
        for faq in self.filter_queryset(self.get_queryset()):
            grouped.setdefault(faq.category, []).append(FAQEntrySerializer(faq).data)
        return Response(grouped)


class CourseTestimonialViewSet(viewsets.ModelViewSet):
    """Moderation queue + creation. Public course pages surface *approved*
    testimonials via CourseDetailSerializer, not through this viewset."""

    def get_queryset(self):
        qs = CourseTestimonial.objects.select_related('user', 'course')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return CourseTestimonialCreateSerializer
        return CourseTestimonialSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.IsAuthenticated()]
        if self.action in ('approve', 'reject'):
            return [permissions.IsAuthenticated(), HasAcademyScope(AcademyPermission.Scope.ACM_WRITE)()]
        return [permissions.IsAuthenticated(), HasAcademyScope(AcademyPermission.Scope.ACM_READ)()]

    @action(detail=True, methods=['put'])
    def approve(self, request, pk=None):
        testimonial = self.get_object()
        testimonial.status = CourseTestimonial.Status.APPROVED
        testimonial.approved_by = request.user
        testimonial.approved_at = timezone.now()
        testimonial.save(update_fields=['status', 'approved_by', 'approved_at'])
        log_academy_action(request, action='testimonial.approve', entity=f'CourseTestimonial:{testimonial.id}')
        return Response(CourseTestimonialSerializer(testimonial).data)

    @action(detail=True, methods=['put'])
    def reject(self, request, pk=None):
        testimonial = self.get_object()
        testimonial.status = CourseTestimonial.Status.REJECTED
        testimonial.approved_by = request.user
        testimonial.approved_at = timezone.now()
        testimonial.save(update_fields=['status', 'approved_by', 'approved_at'])
        log_academy_action(request, action='testimonial.reject', entity=f'CourseTestimonial:{testimonial.id}')
        return Response(CourseTestimonialSerializer(testimonial).data)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class SearchView(APIView):
    """GET /api/v1/academy/search/?q= — icontains across course/lesson
    titles+descriptions, returning direct lesson-level deep links."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if not q:
            return Response({'results': []})

        results = []
        lessons = (
            Lesson.objects.filter(
                Q(title__icontains=q) | Q(description__icontains=q),
                module__course__status=Course.Status.PUBLISHED,
            )
            .select_related('module__course')
            .order_by('module__course_id')[:25]
        )
        for lesson in lessons:
            course = lesson.module.course
            results.append({
                'type': 'lesson',
                'title': lesson.title,
                'duration_minutes': lesson.duration_minutes,
                'course_title': course.title,
                'course_slug': course.slug,
                'lesson_id': lesson.id,
                'deep_link': f'/academy/courses/{course.slug}/learn?lesson={lesson.id}',
            })

        courses = Course.objects.filter(
            Q(title__icontains=q) | Q(description__icontains=q),
            status=Course.Status.PUBLISHED,
        )[:10]
        for course in courses:
            results.append({
                'type': 'course',
                'title': course.title,
                'course_slug': course.slug,
                'deep_link': f'/academy/courses/{course.slug}',
            })

        return Response({'results': results})


# ---------------------------------------------------------------------------
# Certificate verification
# ---------------------------------------------------------------------------

class MyCertificatesView(APIView):
    """GET /api/v1/academy/certificates/ — the caller's OWN certificates.

    Not named anywhere in the original endpoint list (the contract only
    guarantees the ``Certificate`` model and the public verify-by-ID lookup);
    added here, additively, because the learner-facing "View Certificates"
    page needs a way to list its own owner's certificates rather than
    guessing/looking up verification IDs one at a time. Read-only, low risk.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        certificates = (
            Certificate.objects.filter(user=request.user)
            .select_related('course')
            .order_by('-issued_at')
        )
        return Response(MyCertificateSerializer(certificates, many=True).data)


class CertificateDownloadView(APIView):
    """GET /api/v1/academy/certificates/{certificate_id}/download/ — the
    caller's OWN certificate, rendered as a downloadable PDF.

    Not in the original endpoint list either (same additive rationale as
    ``MyCertificatesView`` above): the ``Certificate`` model and serializers
    existed, and the "My certificates" page listed them, but there was no
    way to actually download one. Scoped strictly to
    ``Certificate.objects.filter(user=request.user)`` -- a learner can only
    ever download their own certificate; requesting anyone else's id 404s,
    same as a nonexistent id, so this endpoint never leaks whether a given
    certificate id belongs to someone else.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, certificate_id):
        certificate = Certificate.objects.filter(
            id=certificate_id, user=request.user,
        ).select_related('user', 'course').first()
        if certificate is None:
            from django.http import Http404
            raise Http404
        from .certificate_export import build_certificate_pdf_response
        return build_certificate_pdf_response(certificate)


class CertificateVerifyView(APIView):
    """GET or POST /api/v1/academy/verify/{verification_id}/ — public.

    Returns only what's meant to be public on a certificate: never leaks the
    underlying user id, email, matricule, etc.
    """

    permission_classes = [permissions.AllowAny]

    def _lookup(self, verification_id):
        certificate = Certificate.objects.filter(verification_id=verification_id).select_related('user', 'course').first()
        if certificate is None:
            return Response({'detail': 'No certificate found for this verification ID.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(CertificateVerifySerializer(certificate).data)

    def get(self, request, verification_id):
        return self._lookup(verification_id)

    def post(self, request, verification_id):
        return self._lookup(verification_id)


# ---------------------------------------------------------------------------
# Deep linking
# ---------------------------------------------------------------------------

class DeepLinkCreateView(APIView):
    """POST /api/v1/academy/deep-link/ — public (called pre-auth)."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = DeepLinkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        cache = DeepLinkCache.objects.create(
            state=DeepLinkCache.generate_state(),
            course_id=data.get('courseId'),
            module_id=data.get('moduleId'),
            return_path=data['returnPath'],
        )
        return Response({'state': cache.state}, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# SSO handshake / registration
# ---------------------------------------------------------------------------

class SSOContinueView(APIView):
    """POST /api/v1/academy/sso/continue/ — Path A. The request's own JWT
    already identifies the user; no separate SSO protocol needed."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ensure_academy_profile(request.user)
        state = request.query_params.get('state')
        cache = get_active_deep_link(state)
        return_path = cache.return_path if cache is not None else '/academy'
        recommended = recommended_course_slugs_for_role(request.user.role)
        log_academy_action(request, action='sso.continue', entity=f'User:{request.user.id}')
        return Response({
            'return_path': return_path,
            'recommended_course_slugs': recommended,
        })


class AcademyRegisterView(APIView):
    """POST /api/v1/academy/register/ — Path B. AllowAny: this is the one
    endpoint that creates the account rather than requiring one."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = AcademyRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        matricule = f'ACD-{uuid.uuid4().hex[:10].upper()}'
        user = User.objects.create_user(
            matricule=matricule,
            name=data['name'],
            email=data['email'],
            role=UserRole.ACADEMY_LEARNER,
            password=data['password'],
            phone=data.get('phone') or None,
        )
        ensure_academy_profile(user)

        state = request.query_params.get('state')
        cache = get_active_deep_link(state)
        return_path = cache.return_path if cache is not None else '/academy'

        refresh = RefreshToken.for_user(user)
        return Response({
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'return_path': return_path,
            'user': {
                'id': str(user.id),
                'matricule': user.matricule,
                'name': user.name,
                'email': user.email,
                'role': user.role,
            },
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Lesson completion / quizzes / certificates
# ---------------------------------------------------------------------------

def _maybe_issue_completion_certificate(enrollment):
    course = enrollment.course
    total_lessons = Lesson.objects.filter(module__course=course).count()
    if total_lessons == 0:
        return
    completed_count = LessonProgress.objects.filter(
        enrollment=enrollment, completed_at__isnull=False,
    ).count()
    if completed_count >= total_lessons:
        Certificate.objects.get_or_create(user=enrollment.user, course=course, tier=Certificate.Tier.COMPLETION)


def _maybe_issue_certified_user_certificate(user, course):
    enrollment = CourseEnrollment.objects.filter(user=user, course=course).first()
    if enrollment is None:
        return
    total_lessons = Lesson.objects.filter(module__course=course).count()
    completed_count = LessonProgress.objects.filter(
        enrollment=enrollment, completed_at__isnull=False,
    ).count()
    if total_lessons == 0 or completed_count < total_lessons:
        return
    # Every module quiz AND the course's final assessment must be passed.
    course_quizzes = Quiz.objects.filter(Q(course=course) | Q(lesson__module__course=course))
    if not course_quizzes.exists():
        return
    for quiz in course_quizzes:
        if not QuizAttempt.objects.filter(quiz=quiz, user=user, passed=True).exists():
            return
    Certificate.objects.get_or_create(user=user, course=course, tier=Certificate.Tier.CERTIFIED_USER)


class LessonCompleteView(APIView):
    """POST /api/v1/academy/lessons/{id}/complete/"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        course = lesson.module.course
        enrollment = CourseEnrollment.objects.filter(user=request.user, course=course).first()
        if enrollment is None:
            return Response(
                {'detail': 'You must enroll in this course before completing lessons.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        progress, _ = LessonProgress.objects.get_or_create(enrollment=enrollment, lesson=lesson)
        if progress.completed_at is None:
            progress.completed_at = timezone.now()
            progress.save(update_fields=['completed_at'])
        _maybe_issue_completion_certificate(enrollment)
        return Response({'lesson_id': lesson.id, 'completed': True})


class QuizAttemptView(APIView):
    """GET/POST /api/v1/academy/quizzes/{id}/attempt/"""

    permission_classes = [permissions.IsAuthenticated]

    def _require_enrollment(self, request, quiz):
        """A quiz's questions/answers are gated content of its owning course
        -- exactly like the player and lesson-complete endpoints, only an
        enrolled user may reach them. Without this, quiz_id (a small
        sequential int) is enumerable by any authenticated user, exposing
        module/final-assessment content for courses -- including unpublished
        DRAFT/PENDING_REVIEW ones -- they never enrolled in."""
        course = quiz.owning_course
        if course is not None and not CourseEnrollment.objects.filter(user=request.user, course=course).exists():
            return Response(
                {'detail': 'You must enroll in this course before taking its quizzes.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def get(self, request, quiz_id):
        quiz = get_object_or_404(Quiz, pk=quiz_id)
        gate = self._require_enrollment(request, quiz)
        if gate is not None:
            return gate
        questions = quiz.questions.all()
        return Response({
            'quiz_id': quiz.id,
            'kind': quiz.kind,
            'pass_threshold_percent': quiz.pass_threshold_percent,
            'questions': QuizQuestionPublicSerializer(questions, many=True).data,
        })

    def post(self, request, quiz_id):
        quiz = get_object_or_404(Quiz, pk=quiz_id)
        gate = self._require_enrollment(request, quiz)
        if gate is not None:
            return gate
        serializer = QuizAttemptSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        answers_by_question = {
            a['question_id']: a['selected_index'] for a in serializer.validated_data['answers']
        }
        questions = list(quiz.questions.all())
        if not questions:
            return Response({'detail': 'This quiz has no questions.'}, status=status.HTTP_400_BAD_REQUEST)

        correct = sum(
            1 for question in questions
            if answers_by_question.get(question.id) == question.correct_index
        )
        score_percent = round((correct / len(questions)) * 100, 2)
        passed = score_percent >= quiz.pass_threshold_percent

        attempt = QuizAttempt.objects.create(
            quiz=quiz, user=request.user, score_percent=score_percent, passed=passed,
        )

        if passed:
            course = quiz.owning_course
            if course is not None:
                _maybe_issue_certified_user_certificate(request.user, course)

        return Response({
            'attempt_id': attempt.id,
            'score_percent': float(score_percent),
            'passed': passed,
        })


# ---------------------------------------------------------------------------
# Permission grant/revoke
# ---------------------------------------------------------------------------

class PermissionGrantView(APIView):
    """POST /api/v1/academy/permissions/grant/

    Gating (not spelled out verbatim by the spec, documented per the
    contract's own note): a COURSE_ASSIGN holder may grant any scope EXCEPT
    COURSE_ASSIGN/COURSE_APPROVE themselves — minting more CEO-tier
    authority requires already holding COURSE_APPROVE.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not (
            user_has_scope(request.user, AcademyPermission.Scope.COURSE_ASSIGN)
            or user_has_scope(request.user, AcademyPermission.Scope.COURSE_APPROVE)
        ):
            return Response({'detail': 'Not authorized to grant Academy permissions.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = PermissionGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_user = serializer.validated_data['user']
        scope = serializer.validated_data['scope']

        if scope in CEO_ONLY_SCOPES and not user_has_scope(request.user, AcademyPermission.Scope.COURSE_APPROVE):
            return Response(
                {'detail': f'Only a COURSE_APPROVE holder can grant {scope}.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        grant, created = AcademyPermission.objects.get_or_create(
            user=target_user, scope=scope, defaults={'granted_by': request.user},
        )
        log_academy_action(request, action='permission.grant', entity=f'AcademyPermission:{target_user.id}:{scope}')
        return Response(
            AcademyPermissionSerializer(grant).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PermissionRevokeView(APIView):
    """POST /api/v1/academy/permissions/revoke/ — same gating as grant."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not (
            user_has_scope(request.user, AcademyPermission.Scope.COURSE_ASSIGN)
            or user_has_scope(request.user, AcademyPermission.Scope.COURSE_APPROVE)
        ):
            return Response({'detail': 'Not authorized to revoke Academy permissions.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = PermissionGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_user = serializer.validated_data['user']
        scope = serializer.validated_data['scope']

        if scope in CEO_ONLY_SCOPES and not user_has_scope(request.user, AcademyPermission.Scope.COURSE_APPROVE):
            return Response(
                {'detail': f'Only a COURSE_APPROVE holder can revoke {scope}.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        deleted_count, _ = AcademyPermission.objects.filter(user=target_user, scope=scope).delete()
        log_academy_action(request, action='permission.revoke', entity=f'AcademyPermission:{target_user.id}:{scope}')
        return Response({'revoked': bool(deleted_count)})
