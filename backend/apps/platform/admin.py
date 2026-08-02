from django.contrib import admin
from .models import PlatformSettings, PlatformFees, PublicEvent, TutorialLink


@admin.register(PlatformSettings)
class PlatformSettingsAdmin(admin.ModelAdmin):
    """Admin for PlatformSettings singleton."""

    list_display = ('name', 'maintenance_mode', 'contact_email')
    fieldsets = (
        ('Branding', {'fields': ('name', 'logo')}),
        ('Contact', {'fields': ('contact_email', 'contact_phone')}),
        ('Academic', {'fields': ('payment_deadline', 'honour_roll_threshold')}),
        ('Fees & Links', {'fields': ('fees', 'tutorial_links')}),
        ('Maintenance', {'fields': ('maintenance_mode',)}),
    )

    def has_add_permission(self, request):
        """Prevent adding new instances."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deleting the singleton."""
        return False


@admin.register(PlatformFees)
class PlatformFeesAdmin(admin.ModelAdmin):
    """Admin for PlatformFees."""

    list_display = ('role', 'amount', 'currency')
    list_filter = ('currency', 'role')
    search_fields = ('role',)
    ordering = ['role']


@admin.register(PublicEvent)
class PublicEventAdmin(admin.ModelAdmin):
    """Admin for PublicEvent."""

    list_display = ('title', 'type', 'is_active', 'order', 'created_at')
    list_filter = ('type', 'is_active', 'created_at')
    search_fields = ('title', 'description')
    ordering = ['order', '-created_at']
    fieldsets = (
        ('Content', {'fields': ('type', 'title', 'description', 'url')}),
        ('Display', {'fields': ('is_active', 'order')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )
    readonly_fields = ('created_at', 'updated_at')


@admin.register(TutorialLink)
class TutorialLinkAdmin(admin.ModelAdmin):
    """Admin for TutorialLink."""

    list_display = ('role', 'title', 'url')
    list_filter = ('role',)
    search_fields = ('role', 'title')
    ordering = ['role', 'title']
