import logging

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    AcademyPermission,
    Certificate,
    Course,
    CourseEnrollment,
    CourseTestimonial,
    FAQEntry,
    Lesson,
    LessonProgress,
    Module,
    ProfileConfig,
    Quiz,
    QuizQuestion,
    Resource,
    TrainerProfile,
)
from .permissions import user_has_scope

logger = logging.getLogger(__name__)
User = get_user_model()


# ---------------------------------------------------------------------------
# Shared / small pieces
# ---------------------------------------------------------------------------

class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = ['id', 'title', 'file_url', 'resource_type']


class ResourceWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Resource
        fields = ['id', 'title', 'file_url', 'resource_type']


class AuthorBriefSerializer(serializers.Serializer):
    """Minimal public-safe user representation embedded in course/testimonial
    payloads — never leaks matricule/email/school to anonymous visitors."""
    id = serializers.CharField(source='pk', read_only=True)
    name = serializers.CharField(read_only=True)


# ---------------------------------------------------------------------------
# Modules / Lessons — public (no video) vs player (full) vs write
# ---------------------------------------------------------------------------

class LessonPublicSerializer(serializers.ModelSerializer):
    """Titles + durations only — video URLs are gated behind enrollment."""

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'order', 'duration_minutes', 'description']


class LessonPlayerSerializer(serializers.ModelSerializer):
    completed = serializers.SerializerMethodField()
    # Not in the original field list — added additively so the player UI has
    # something to call GET/POST /academy/quizzes/{id}/attempt/ *with*. A
    # lesson may have at most one MODULE_QUIZ in practice; `.first()` keeps
    # this cheap and null-safe for lessons with none.
    quiz_id = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'order', 'duration_minutes', 'description',
            'video_provider', 'video_url', 'completed', 'quiz_id',
        ]

    def get_completed(self, obj):
        progress_by_lesson = self.context.get('progress_by_lesson', {})
        return progress_by_lesson.get(obj.id, False)

    def get_quiz_id(self, obj):
        quiz = next(iter(obj.quizzes.all()), None)
        return quiz.id if quiz else None


class LessonWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    resources = ResourceWriteSerializer(many=True, required=False)

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'order', 'duration_minutes', 'video_provider',
            'video_url', 'description', 'resources',
        ]

    def validate_duration_minutes(self, value):
        # Task-oriented lessons should run 3-10 minutes per the spec, but this
        # is a warning, not a hard block — real content occasionally differs.
        if value is not None and not (3 <= value <= 10):
            logger.warning(
                'academy: lesson duration %s minutes is outside the recommended 3-10 minute range', value,
            )
        return value


class ModulePublicSerializer(serializers.ModelSerializer):
    lessons = LessonPublicSerializer(many=True, read_only=True)

    class Meta:
        model = Module
        fields = ['id', 'title', 'order', 'lessons']


class ModulePlayerSerializer(serializers.ModelSerializer):
    lessons = serializers.SerializerMethodField()

    class Meta:
        model = Module
        fields = ['id', 'title', 'order', 'lessons']

    def get_lessons(self, obj):
        return LessonPlayerSerializer(obj.lessons.all(), many=True, context=self.context).data


class ModuleWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    lessons = LessonWriteSerializer(many=True, required=False)

    class Meta:
        model = Module
        fields = ['id', 'title', 'order', 'lessons']


# ---------------------------------------------------------------------------
# Trainers
# ---------------------------------------------------------------------------

class TrainerProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name', read_only=True)
    user_id = serializers.CharField(source='user.id', read_only=True)

    class Meta:
        model = TrainerProfile
        fields = ['id', 'user_id', 'name', 'bio', 'photo_url', 'credentials', 'is_verified']
        read_only_fields = ['id', 'is_verified']


class TrainerProfileWriteSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())

    class Meta:
        model = TrainerProfile
        fields = ['id', 'user', 'bio', 'photo_url', 'credentials', 'is_verified']
        read_only_fields = ['id']


# ---------------------------------------------------------------------------
# Testimonials
# ---------------------------------------------------------------------------

class CourseTestimonialSerializer(serializers.ModelSerializer):
    user = AuthorBriefSerializer(read_only=True)
    course_slug = serializers.CharField(source='course.slug', read_only=True)

    class Meta:
        model = CourseTestimonial
        fields = ['id', 'user', 'course', 'course_slug', 'message', 'rating', 'status', 'approved_at', 'created_at']
        read_only_fields = ['id', 'status', 'approved_at', 'created_at']


class CourseTestimonialCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseTestimonial
        fields = ['id', 'course', 'message', 'rating']

    def validate_course(self, course):
        request = self.context['request']
        if not CourseEnrollment.objects.filter(user=request.user, course=course).exists():
            raise serializers.ValidationError('You must be enrolled in this course to leave a testimonial.')
        return course

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# FAQ / Profile config
# ---------------------------------------------------------------------------

class FAQEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQEntry
        fields = ['id', 'question', 'answer', 'category', 'order']


class ProfileConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfileConfig
        fields = [
            'tagline', 'mission', 'vision', 'description', 'logo_url',
            'courses_count_override', 'learners_count_override', 'certificates_count_override',
            'updated_at',
        ]
        read_only_fields = ['updated_at']


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

class CourseListSerializer(serializers.ModelSerializer):
    """Catalog card shape: enough for the grid, nothing more."""
    module_count = serializers.IntegerField(read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Course
        fields = [
            'id', 'title', 'slug', 'description', 'thumbnail_url', 'role_pathway',
            'status', 'is_featured', 'module_count', 'duration_minutes', 'created_at',
        ]


class CourseDetailSerializer(serializers.ModelSerializer):
    """Public course detail: modules/lessons (no video), trainer bio,
    approved testimonials only, resources."""
    modules = ModulePublicSerializer(many=True, read_only=True)
    resources = ResourceSerializer(many=True, read_only=True)
    testimonials = serializers.SerializerMethodField()
    trainer = serializers.SerializerMethodField()
    duration_minutes = serializers.IntegerField(read_only=True)
    module_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Course
        fields = [
            'id', 'title', 'slug', 'description', 'thumbnail_url', 'role_pathway',
            'status', 'is_featured', 'module_count', 'duration_minutes',
            'modules', 'resources', 'testimonials', 'trainer', 'created_at',
        ]

    def get_testimonials(self, obj):
        approved = obj.testimonials.filter(status=CourseTestimonial.Status.APPROVED)
        return CourseTestimonialSerializer(approved, many=True).data

    def get_trainer(self, obj):
        trainer_profile = getattr(obj.created_by, 'academy_trainer_profile', None)
        if trainer_profile is None:
            return None
        return TrainerProfileSerializer(trainer_profile).data


class CoursePlayerSerializer(serializers.ModelSerializer):
    """Full lesson content INCLUDING video URLs — only ever handed to an
    enrolled user, enforced by the view, not this serializer."""
    modules = serializers.SerializerMethodField()
    # Not in the original field list — same reasoning as Lesson.quiz_id
    # above: the player UI needs the course-level FINAL_ASSESSMENT quiz's id
    # to call the attempt endpoint, and nothing else in the API surfaces it.
    final_assessment_id = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'title', 'slug', 'description', 'role_pathway', 'modules', 'final_assessment_id']

    def get_modules(self, obj):
        return ModulePlayerSerializer(obj.modules.all(), many=True, context=self.context).data

    def get_final_assessment_id(self, obj):
        quiz = obj.final_assessments.filter(kind='FINAL_ASSESSMENT').first()
        return quiz.id if quiz else None


class CourseWriteSerializer(serializers.ModelSerializer):
    """Create/edit a course and its content tree.

    ``status`` is intentionally NOT a field here — it can only ever move via
    the dedicated ``approve``/``reject``/``submit-for-review`` actions. This
    is a hard security requirement from the spec, not a convenience choice.
    """

    modules = ModuleWriteSerializer(many=True, required=False)
    resources = ResourceWriteSerializer(many=True, required=False)
    assigned_by = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Course
        fields = [
            'id', 'title', 'slug', 'description', 'role_pathway',
            'assigned_by', 'thumbnail_url', 'is_featured', 'modules', 'resources',
        ]
        read_only_fields = ['id']
        extra_kwargs = {'slug': {'required': False}}

    def validate(self, attrs):
        if self.instance is None:
            # Create: a Course Creator "may only build courses formally
            # assigned by the CEO" — assigned_by must be a real, currently
            # held COURSE_ASSIGN grant. You cannot self-assign.
            assigned_by = attrs.get('assigned_by')
            if assigned_by is None or not user_has_scope(assigned_by, AcademyPermission.Scope.COURSE_ASSIGN):
                raise serializers.ValidationError({
                    'assigned_by': 'A course must be assigned by a user who currently holds COURSE_ASSIGN.',
                })
        return attrs

    def validate_slug(self, value):
        if not value:
            return value
        qs = Course.objects.filter(slug=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A course with this slug already exists.')
        return value

    def create(self, validated_data):
        from django.utils.text import slugify

        modules_data = validated_data.pop('modules', [])
        resources_data = validated_data.pop('resources', [])
        if not validated_data.get('slug'):
            validated_data['slug'] = slugify(validated_data['title'])[:280]
        validated_data['created_by'] = self.context['request'].user
        course = Course.objects.create(**validated_data)
        self._save_modules(course, modules_data)
        self._save_resources(course, resources_data)
        return course

    def update(self, instance, validated_data):
        modules_data = validated_data.pop('modules', None)
        resources_data = validated_data.pop('resources', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if modules_data is not None:
            # MVP simplification: a content edit replaces the whole tree
            # rather than diffing it lesson-by-lesson.
            instance.modules.all().delete()
            self._save_modules(instance, modules_data)
        if resources_data is not None:
            instance.resources.filter(lesson__isnull=True).delete()
            self._save_resources(instance, resources_data)
        return instance

    @staticmethod
    def _save_modules(course, modules_data):
        for module_data in modules_data:
            module_data = dict(module_data)
            module_data.pop('id', None)
            lessons_data = module_data.pop('lessons', [])
            module = Module.objects.create(course=course, **module_data)
            for lesson_data in lessons_data:
                lesson_data = dict(lesson_data)
                lesson_data.pop('id', None)
                lesson_resources = lesson_data.pop('resources', [])
                lesson = Lesson.objects.create(module=module, **lesson_data)
                for resource_data in lesson_resources:
                    resource_data = dict(resource_data)
                    resource_data.pop('id', None)
                    Resource.objects.create(lesson=lesson, **resource_data)

    @staticmethod
    def _save_resources(course, resources_data):
        for resource_data in resources_data:
            resource_data = dict(resource_data)
            resource_data.pop('id', None)
            Resource.objects.create(course=course, **resource_data)


# ---------------------------------------------------------------------------
# Quizzes
# ---------------------------------------------------------------------------

class QuizQuestionPublicSerializer(serializers.ModelSerializer):
    """WITHOUT correct_index — served when a learner starts an attempt."""

    class Meta:
        model = QuizQuestion
        fields = ['id', 'text', 'choices']


class QuizAttemptAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    selected_index = serializers.IntegerField(min_value=0)


class QuizAttemptSubmitSerializer(serializers.Serializer):
    answers = QuizAttemptAnswerSerializer(many=True)


# ---------------------------------------------------------------------------
# Identity / SSO / registration / permissions
# ---------------------------------------------------------------------------

class AcademyRegisterSerializer(serializers.Serializer):
    """Path B: a standalone learner account with no school tenant."""
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value


class AcademyPermissionSerializer(serializers.ModelSerializer):
    user_matricule = serializers.CharField(source='user.matricule', read_only=True)
    granted_by_matricule = serializers.CharField(source='granted_by.matricule', read_only=True, allow_null=True)

    class Meta:
        model = AcademyPermission
        fields = ['id', 'user', 'user_matricule', 'scope', 'granted_by', 'granted_by_matricule', 'granted_at']
        read_only_fields = ['id', 'granted_by', 'granted_at']


class PermissionGrantSerializer(serializers.Serializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    scope = serializers.ChoiceField(choices=AcademyPermission.Scope.choices)


class DeepLinkCreateSerializer(serializers.Serializer):
    courseId = serializers.UUIDField(required=False, allow_null=True)
    moduleId = serializers.UUIDField(required=False, allow_null=True)
    returnPath = serializers.CharField(max_length=500)

    def validate_returnPath(self, value):
        """Same discipline as the frontend's sanitizeNextPath (login/page.tsx):
        only an internal, same-origin path may ever be cached here. Without
        this, an anonymous caller could POST an external URL as returnPath,
        get back a `state` token, and hand a victim a same-domain
        /academy/start?state=... link that redirects them off-site
        immediately after a real, successful login -- a strong phishing
        primitive. Never relax this to allow a scheme or a protocol-relative
        ("//host/...") value."""
        if not value.startswith('/') or value.startswith('//'):
            raise serializers.ValidationError('returnPath must be an internal path starting with a single "/".')
        return value


class CertificateVerifySerializer(serializers.ModelSerializer):
    learner_name = serializers.CharField(source='user.name', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)

    class Meta:
        model = Certificate
        fields = ['verification_id', 'learner_name', 'course_title', 'tier', 'issued_at']


class MyCertificateSerializer(serializers.ModelSerializer):
    """The caller's own certificate — same public-safe shape as
    ``CertificateVerifySerializer`` plus the course slug (needed to link to
    the public verify page) since this is read by the certificate's owner,
    not an anonymous verifier."""
    learner_name = serializers.CharField(source='user.name', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    course_slug = serializers.CharField(source='course.slug', read_only=True)

    class Meta:
        model = Certificate
        fields = ['id', 'verification_id', 'learner_name', 'course_title', 'course_slug', 'tier', 'issued_at']
