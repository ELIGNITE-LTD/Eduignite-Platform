from django.contrib import admin

from .models import BotIdentity, BotLinkCode


@admin.register(BotIdentity)
class BotIdentityAdmin(admin.ModelAdmin):
    list_display = ['channel', 'external_id', 'username', 'display_name', 'user', 'linked_at', 'last_seen_at', 'is_blocked']
    list_filter = ['channel', 'is_blocked']
    search_fields = ['external_id', 'username', 'display_name', 'user__matricule', 'user__email']
    readonly_fields = ['created_at', 'updated_at', 'last_seen_at']
    exclude = ['history']


@admin.register(BotLinkCode)
class BotLinkCodeAdmin(admin.ModelAdmin):
    list_display = ['code', 'user', 'channel', 'expires_at', 'used_at']
    readonly_fields = ['code', 'user', 'channel', 'expires_at', 'used_at', 'used_by', 'created_at']
