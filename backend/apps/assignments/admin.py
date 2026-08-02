from django.contrib import admin

from .models import Assignment, AssignmentSubmission


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'school', 'target_class', 'teacher', 'status', 'due_date')
    list_filter = ('status', 'school', 'target_class', 'submission_type')
    search_fields = ('title', 'target_class', 'subject__name', 'teacher__name')


@admin.register(AssignmentSubmission)
class AssignmentSubmissionAdmin(admin.ModelAdmin):
    list_display = ('assignment', 'student', 'status', 'score', 'graded_by', 'created')
    list_filter = ('status', 'assignment__school')
    search_fields = ('assignment__title', 'student__user__name', 'student__admission_number')

