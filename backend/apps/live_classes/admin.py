from django.contrib import admin
from .models import LiveClass, LiveClassEnrollment


@admin.register(LiveClass)
class LiveClassAdmin(admin.ModelAdmin):
    list_display = ['title', 'teacher', 'target_class', 'start_time', 'status', 'enrolled_count', 'school']
    list_filter = ['status', 'platform', 'school']
    search_fields = ['title', 'teacher__name', 'target_class']
    readonly_fields = ['enrolled_count', 'created', 'modified']
    ordering = ['-start_time']


@admin.register(LiveClassEnrollment)
class LiveClassEnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'live_class', 'joined_at', 'duration_attended']
    list_filter = ['live_class__status']
    search_fields = ['student__name', 'live_class__title']
