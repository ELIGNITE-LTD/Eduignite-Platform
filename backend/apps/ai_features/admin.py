from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from .models import AIRequest, AIInsight


@admin.register(AIRequest)
class AIRequestAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'user_display', 'request_type_display',
        'status_badge', 'tokens_used', 'processing_time_display', 'created_at'
    ]
    list_filter = ['request_type', 'status', 'model_used', 'created_at']
    search_fields = ['user__first_name', 'user__last_name', 'prompt', 'response']
    readonly_fields = ['id', 'created_at', 'updated_at', 'tokens_used', 'processing_time_ms']
    fieldsets = (
        (_('Request Information'), {
            'fields': ('id', 'user', 'school', 'request_type', 'model_used')
        }),
        (_('Content'), {
            'fields': ('prompt', 'response'),
            'classes': ('collapse',)
        }),
        (_('Status'), {
            'fields': ('status', 'error_message')
        }),
        (_('Metrics'), {
            'fields': ('tokens_used', 'processing_time_ms')
        }),
        (_('Timestamps'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def user_display(self, obj):
        return obj.user.get_full_name() if obj.user else 'Unknown'

    user_display.short_description = _('User')

    def request_type_display(self, obj):
        return obj.get_request_type_display()

    request_type_display.short_description = _('Type')

    def status_badge(self, obj):
        colors = {
            'pending': '#ffc107',
            'processing': '#17a2b8',
            'completed': '#28a745',
            'failed': '#dc3545',
        }
        color = colors.get(obj.status, '#6c757d')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display()
        )

    status_badge.short_description = _('Status')

    def processing_time_display(self, obj):
        if obj.processing_time_ms:
            return f"{obj.processing_time_ms}ms"
        return "-"

    processing_time_display.short_description = _('Time')


@admin.register(AIInsight)
class AIInsightAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'insight_type_display', 'title', 'school_display',
        'active_badge', 'expires_at', 'created_at'
    ]
    list_filter = ['insight_type', 'is_active', 'created_at', 'expires_at']
    search_fields = ['title', 'description', 'school__name']
    readonly_fields = ['id', 'created_at', 'updated_at', 'is_expired']
    fieldsets = (
        (_('Insight Information'), {
            'fields': ('id', 'insight_type', 'school', 'title')
        }),
        (_('Content'), {
            'fields': ('description', 'data'),
        }),
        (_('Distribution'), {
            'fields': ('target_role',),
            'description': 'Comma-separated list of roles that should see this insight'
        }),
        (_('Status'), {
            'fields': ('is_active', 'expires_at', 'is_expired')
        }),
        (_('Timestamps'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def insight_type_display(self, obj):
        return obj.get_insight_type_display()

    insight_type_display.short_description = _('Type')

    def school_display(self, obj):
        return obj.school.name if obj.school else 'All Schools'

    school_display.short_description = _('School')

    def active_badge(self, obj):
        if obj.is_active:
            if obj.is_expired():
                color = '#dc3545'
                text = 'Expired'
            else:
                color = '#28a745'
                text = 'Active'
        else:
            color = '#6c757d'
            text = 'Inactive'

        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            text
        )

    active_badge.short_description = _('Status')
