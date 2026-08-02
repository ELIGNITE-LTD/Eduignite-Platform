from django.contrib import admin

from .models import Notification, NotificationDevice


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'recipient', 'notification_type', 'priority', 'is_read', 'created')
    list_filter = ('notification_type', 'priority', 'is_read', 'created')
    search_fields = ('title', 'message', 'recipient__name', 'recipient__email')
    autocomplete_fields = ('recipient', 'sender')
    readonly_fields = ('created', 'modified')


@admin.register(NotificationDevice)
class NotificationDeviceAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'active', 'last_seen_at', 'modified')
    list_filter = ('platform', 'active')
    search_fields = ('user__name', 'user__email', 'token')
    autocomplete_fields = ('user',)
