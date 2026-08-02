from django.contrib import admin
from .models import School, SchoolSettings


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    """Admin for School model."""

    list_display = ('id', 'name', 'principal', 'location', 'status', 'student_count', 'teacher_count')
    list_filter = ('status', 'region', 'founded_year', 'created_at')
    search_fields = ('id', 'name', 'principal', 'email', 'location')
    readonly_fields = ('student_count', 'teacher_count', 'created_at', 'updated_at')
    ordering = ('-created_at',)

    fieldsets = (
        ('Basic Information', {'fields': ('id', 'name', 'short_name', 'principal', 'principal_user')}),
        ('Identity', {'fields': ('motto', 'logo', 'banner', 'description')}),
        ('Location', {'fields': ('location', 'region', 'division', 'sub_division', 'city_village', 'address', 'postal_code')}),
        ('Contact', {'fields': ('phone', 'email')}),
        ('Status & Counts', {'fields': ('status', 'founded_year', 'student_count', 'teacher_count')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )


@admin.register(SchoolSettings)
class SchoolSettingsAdmin(admin.ModelAdmin):
    """Admin for SchoolSettings model."""

    list_display = ('school', 'academic_year', 'term', 'licence_expiry', 'allow_ai_features')
    list_filter = ('term', 'academic_year', 'allow_ai_features')
    search_fields = ('school__name',)

    fieldsets = (
        ('School', {'fields': ('school',)}),
        ('Academic', {'fields': ('academic_year', 'term')}),
        ('Limits', {'fields': ('max_students', 'max_teachers')}),
        ('AI Features', {'fields': ('allow_ai_features', 'ai_request_limit')}),
        ('License', {'fields': ('licence_expiry',)}),
    )
