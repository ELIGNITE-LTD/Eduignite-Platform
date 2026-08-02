from django.contrib import admin

from .models import AppStoreItem


@admin.register(AppStoreItem)
class AppStoreItemAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'featured', 'active', 'archived', 'created_by', 'created')
    list_filter = ('category', 'featured', 'active', 'archived')
    search_fields = ('title', 'short_description', 'full_description')
    autocomplete_fields = ('created_by',)
    readonly_fields = ('created', 'modified')
