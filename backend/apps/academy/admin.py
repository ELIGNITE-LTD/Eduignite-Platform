from django.contrib import admin

from .models import (
    AcademyAuditLog,
    AcademyPermission,
    AcademyProfile,
    Certificate,
    CertificateSequenceCounter,
    Course,
    CourseEnrollment,
    CourseTestimonial,
    DeepLinkCache,
    FAQEntry,
    Lesson,
    LessonProgress,
    Module,
    ProfileConfig,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    Resource,
    TrainerProfile,
)


@admin.register(AcademyProfile)
class AcademyProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'headline', 'created_at')
    search_fields = ('user__matricule', 'user__name', 'user__email')


@admin.register(AcademyPermission)
class AcademyPermissionAdmin(admin.ModelAdmin):
    list_display = ('user', 'scope', 'granted_by', 'granted_at')
    list_filter = ('scope',)
    search_fields = ('user__matricule', 'user__name')


class ModuleInline(admin.StackedInline):
    model = Module
    extra = 0


class ResourceInline(admin.TabularInline):
    model = Resource
    extra = 0
    fk_name = 'course'


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    """Modules/lessons are authored via the API's nested course write
    endpoint (POST/PUT /academy/courses/); this admin view is for
    inspection/override, not the primary authoring workflow."""

    list_display = ('title', 'slug', 'role_pathway', 'status', 'is_featured', 'created_by', 'assigned_by', 'created_at')
    list_filter = ('status', 'role_pathway', 'is_featured')
    search_fields = ('title', 'slug', 'created_by__matricule')
    prepopulated_fields = {'slug': ('title',)}
    inlines = [ModuleInline, ResourceInline]
    readonly_fields = ('approved_by', 'approved_at')


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'order')
    list_filter = ('course',)


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ('title', 'module', 'order', 'duration_minutes', 'video_provider')
    list_filter = ('video_provider',)


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'lesson', 'resource_type')
    list_filter = ('resource_type',)


@admin.register(CourseEnrollment)
class CourseEnrollmentAdmin(admin.ModelAdmin):
    list_display = ('user', 'course', 'source', 'enrolled_at')
    list_filter = ('source',)
    search_fields = ('user__matricule', 'course__slug')


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ('enrollment', 'lesson', 'completed_at')


class QuizQuestionInline(admin.StackedInline):
    model = QuizQuestion
    extra = 1


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    """Phase 1: quiz/question authoring is admin-managed — the contract's
    endpoint list only specifies quiz-*taking* (`quizzes/{id}/attempt/`),
    not a quiz-authoring API, so this is the deliberate content path."""

    list_display = ('id', 'kind', 'lesson', 'course', 'pass_threshold_percent')
    list_filter = ('kind',)
    inlines = [QuizQuestionInline]


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ('user', 'quiz', 'score_percent', 'passed', 'attempted_at')
    list_filter = ('passed',)
    search_fields = ('user__matricule',)


@admin.register(CertificateSequenceCounter)
class CertificateSequenceCounterAdmin(admin.ModelAdmin):
    list_display = ('year', 'last_value')
    readonly_fields = ('year', 'last_value')


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ('verification_id', 'user', 'course', 'tier', 'issued_at')
    list_filter = ('tier',)
    search_fields = ('verification_id', 'user__matricule', 'course__slug')
    readonly_fields = ('id', 'verification_id', 'issued_at')


@admin.register(DeepLinkCache)
class DeepLinkCacheAdmin(admin.ModelAdmin):
    list_display = ('state', 'course_id', 'module_id', 'return_path', 'created_at')
    readonly_fields = ('state', 'created_at')


@admin.register(ProfileConfig)
class ProfileConfigAdmin(admin.ModelAdmin):
    list_display = ('tagline', 'updated_at')

    def has_add_permission(self, request):
        return not ProfileConfig.objects.exists()


@admin.register(CourseTestimonial)
class CourseTestimonialAdmin(admin.ModelAdmin):
    list_display = ('user', 'course', 'rating', 'status', 'approved_by', 'created_at')
    list_filter = ('status', 'rating')
    search_fields = ('user__matricule', 'course__slug')


@admin.register(TrainerProfile)
class TrainerProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'is_verified', 'created_at')
    list_filter = ('is_verified',)
    search_fields = ('user__matricule', 'user__name')


@admin.register(FAQEntry)
class FAQEntryAdmin(admin.ModelAdmin):
    list_display = ('question', 'category', 'order')
    list_filter = ('category',)


@admin.register(AcademyAuditLog)
class AcademyAuditLogAdmin(admin.ModelAdmin):
    """Append-only: no add/change/delete via admin either."""

    list_display = ('timestamp', 'user', 'action', 'entity', 'ip_address')
    list_filter = ('action',)
    search_fields = ('entity', 'user__matricule')
    readonly_fields = [f.name for f in AcademyAuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
