from django.contrib import admin
from .models import Announcement, AnnouncementRead


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ['title', 'sender', 'target', 'is_pinned', 'created_at', 'view_count']
    list_filter = ['school', 'target', 'is_pinned', 'created_at']
    search_fields = ['title', 'content', 'sender__first_name', 'sender__last_name']
    readonly_fields = ['created_at', 'updated_at', 'view_count']
    date_hierarchy = 'created_at'


@admin.register(AnnouncementRead)
class AnnouncementReadAdmin(admin.ModelAdmin):
    list_display = ['announcement', 'user', 'read_at']
    list_filter = ['read_at', 'announcement__created_at']
    search_fields = ['announcement__title', 'user__first_name', 'user__last_name']
    readonly_fields = ['read_at']
