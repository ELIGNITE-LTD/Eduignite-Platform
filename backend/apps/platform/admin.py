from django.contrib import admin
from .models import AppVersion, PlatformSettings, PlatformFees, PublicEvent, TutorialLink


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


@admin.register(AppVersion)
class AppVersionAdmin(admin.ModelAdmin):
    """Admin for AppVersion — the only place min_supported_version is edited.

    CI's POST endpoint (apps/platform/app_version_views.py) only ever writes
    latest_version, download_url and release_notes. Bumping
    min_supported_version — the floor below which an app is force-blocked —
    is a deliberate human call made here, not an automatic side effect of a
    release.
    """

    list_display = ('app_key', 'latest_version', 'min_supported_version', 'updated_at')
    list_filter = ('app_key',)
    search_fields = ('app_key',)
    ordering = ['app_key']
    readonly_fields = ('updated_at',)
    fieldsets = (
        (None, {'fields': ('app_key',)}),
        ('CI-managed (published by the release workflow)', {
            'fields': ('latest_version', 'download_url', 'release_notes'),
        }),
        ('Manual-only — never touched by CI', {
            'fields': ('min_supported_version',),
            'description': (
                'The "must update" floor. Raising this forces every app below it into a '
                'blocking update screen. Always a deliberate decision — set it by hand.'
            ),
        }),
        ('Timestamps', {'fields': ('updated_at',)}),
    )


@admin.register(TutorialLink)
class TutorialLinkAdmin(admin.ModelAdmin):
    """Admin for TutorialLink."""

    list_display = ('role', 'title', 'url')
    list_filter = ('role',)
    search_fields = ('role', 'title')
    ordering = ['role', 'title']
