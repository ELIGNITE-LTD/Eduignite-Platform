from django.contrib import admin
from .models import Announcement, AnnouncementAudienceGrant, AnnouncementRead


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ['title', 'sender', 'target', 'target_school', 'legacy_target', 'is_pinned', 'created_at', 'view_count']
    list_filter = ['school', 'target', 'is_pinned', 'created_at']
    search_fields = ['title', 'content', 'sender__name', 'sender__matricule']
    readonly_fields = ['created_at', 'updated_at', 'view_count', 'legacy_target']
    date_hierarchy = 'created_at'


@admin.register(AnnouncementAudienceGrant)
class AnnouncementAudienceGrantAdmin(admin.ModelAdmin):
    list_display = ['user', 'audience', 'granted_by', 'created_at']
    list_filter = ['audience']
    search_fields = ['user__name', 'user__matricule']
    readonly_fields = ['created_at']


@admin.register(AnnouncementRead)
class AnnouncementReadAdmin(admin.ModelAdmin):
    list_display = ['announcement', 'user', 'read_at']
    list_filter = ['read_at', 'announcement__created_at']
    search_fields = ['announcement__title', 'user__first_name', 'user__last_name']
    readonly_fields = ['read_at']
