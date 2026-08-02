from django.contrib import admin

from .models import AppInstallation


@admin.register(AppInstallation)
class AppInstallationAdmin(admin.ModelAdmin):
    list_display = ('app_key', 'school', 'is_enabled', 'licence_expiry', 'installed_at')
    list_filter = ('app_key', 'is_enabled')
    search_fields = ('app_key', 'school__name')
    raw_id_fields = ('school', 'installed_by')
