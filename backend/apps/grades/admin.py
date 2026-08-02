from django.contrib import admin
from .models import Subject, Sequence, Grade, TermResult, AnnualResult


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'level', 'school', 'coefficient', 'teacher', 'is_active']
    list_filter = ['school', 'level', 'is_active', 'created']
    search_fields = ['name', 'code', 'teacher__first_name', 'teacher__last_name']
    readonly_fields = ['id', 'created', 'modified']


@admin.register(Sequence)
class SequenceAdmin(admin.ModelAdmin):
    list_display = ['name', 'academic_year', 'term', 'school', 'start_date', 'end_date', 'is_active']
    list_filter = ['school', 'academic_year', 'term', 'is_active']
    search_fields = ['name', 'academic_year']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ['student', 'subject', 'sequence', 'score', 'teacher']
    list_filter = ['school', 'sequence', 'subject', 'created']
    search_fields = ['student__admission_number', 'student__user__first_name', 'student__user__last_name']
    readonly_fields = ['id', 'created', 'modified']


@admin.register(TermResult)
class TermResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'academic_year', 'term', 'average', 'rank', 'is_promoted']
    list_filter = ['school', 'academic_year', 'term', 'is_promoted']
    search_fields = ['student__admission_number', 'student__user__first_name', 'student__user__last_name']
    readonly_fields = ['id', 'created', 'modified']


@admin.register(AnnualResult)
class AnnualResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'academic_year', 'annual_average', 'rank', 'is_on_honour_roll', 'is_promoted']
    list_filter = ['school', 'academic_year', 'is_on_honour_roll', 'is_promoted']
    search_fields = ['student__admission_number', 'student__user__first_name', 'student__user__last_name']
    readonly_fields = ['id', 'created', 'modified']
