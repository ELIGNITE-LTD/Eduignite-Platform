from django.contrib import admin

from .models import Exam, ExamQuestion, ExamSubmission


class ExamQuestionInline(admin.TabularInline):
    model = ExamQuestion
    extra = 0


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ('title', 'school', 'mode', 'target_class', 'start_time', 'status')
    list_filter = ('mode', 'status', 'school')
    search_fields = ('title', 'target_class', 'subject__name')
    inlines = [ExamQuestionInline]


@admin.register(ExamSubmission)
class ExamSubmissionAdmin(admin.ModelAdmin):
    list_display = ('exam', 'student', 'score', 'percentage', 'status', 'submitted_at')
    list_filter = ('status', 'exam__school')
    search_fields = ('exam__title', 'student__user__name', 'student__admission_number')
