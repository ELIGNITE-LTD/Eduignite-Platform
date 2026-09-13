from django.contrib import admin

from .models import Survey, SurveyAnswer, SurveyQuestion, SurveyResponse


class SurveyQuestionInline(admin.StackedInline):
    model = SurveyQuestion
    extra = 1


@admin.register(Survey)
class SurveyAdmin(admin.ModelAdmin):
    """A second authoring path alongside the CEO/CTO-only create/edit API
    (see views.py's SurveyViewSet) -- either works against the same data."""

    list_display = ('title', 'is_active', 'created_by', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('title', 'description')
    inlines = [SurveyQuestionInline]
    readonly_fields = ('created_at',)

    def save_model(self, request, obj, form, change):
        if not change and not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(SurveyQuestion)
class SurveyQuestionAdmin(admin.ModelAdmin):
    list_display = ('survey', 'question_text', 'question_type', 'order')
    list_filter = ('question_type', 'survey')
    search_fields = ('question_text',)


@admin.register(SurveyResponse)
class SurveyResponseAdmin(admin.ModelAdmin):
    """Read-only: responses are created only via the API's respond action."""

    list_display = ('survey', 'user', 'submitted_at')
    list_filter = ('survey',)
    search_fields = ('user__matricule', 'user__name')
    readonly_fields = ('survey', 'user', 'submitted_at')

    def has_add_permission(self, request):
        return False


@admin.register(SurveyAnswer)
class SurveyAnswerAdmin(admin.ModelAdmin):
    list_display = ('response', 'question', 'answer_text')
    search_fields = ('answer_text',)
    readonly_fields = ('response', 'question', 'answer_text')

    def has_add_permission(self, request):
        return False
