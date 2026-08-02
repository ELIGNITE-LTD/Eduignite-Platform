from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from .models import Conversation, ConversationParticipant, Message


class ConversationParticipantInline(admin.TabularInline):
    model = ConversationParticipant
    extra = 1
    fields = ['user', 'role', 'joined_at', 'is_muted', 'last_read_at']
    readonly_fields = ['joined_at', 'last_read_at']


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'conversation_type_display', 'name_or_participants',
        'participant_count', 'last_message_at', 'is_active'
    ]
    list_filter = ['conversation_type', 'is_active', 'created_at', 'last_message_at']
    search_fields = ['name', 'participants__first_name', 'participants__last_name']
    readonly_fields = ['created_at', 'updated_at', 'id']
    inlines = [ConversationParticipantInline]
    fieldsets = (
        (_('Basic Information'), {
            'fields': ('id', 'conversation_type', 'name', 'school', 'created_by')
        }),
        (_('Message Information'), {
            'fields': ('last_message', 'last_message_at')
        }),
        (_('Status'), {
            'fields': ('is_active',)
        }),
        (_('Timestamps'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def conversation_type_display(self, obj):
        colors = {
            'direct': '#17a2b8',
            'group': '#28a745',
            'official': '#ffc107',
            'support': '#dc3545',
        }
        color = colors.get(obj.conversation_type, '#6c757d')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_conversation_type_display()
        )

    conversation_type_display.short_description = _('Type')

    def name_or_participants(self, obj):
        if obj.name:
            return obj.name
        participants = list(obj.participants.values_list('first_name', flat=True)[:3])
        return ', '.join(participants) if participants else 'No participants'

    name_or_participants.short_description = _('Name/Participants')

    def participant_count(self, obj):
        return obj.participants.count()

    participant_count.short_description = _('Participants')


@admin.register(ConversationParticipant)
class ConversationParticipantAdmin(admin.ModelAdmin):
    list_display = ['id', 'user_display', 'conversation_display', 'role', 'joined_at', 'is_muted']
    list_filter = ['role', 'is_muted', 'joined_at']
    search_fields = ['user__first_name', 'user__last_name', 'conversation__name']
    readonly_fields = ['created_at', 'updated_at', 'joined_at']
    fieldsets = (
        (_('Participant Information'), {
            'fields': ('conversation', 'user', 'role')
        }),
        (_('Status'), {
            'fields': ('joined_at', 'last_read_at', 'is_muted')
        }),
        (_('Timestamps'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def user_display(self, obj):
        return obj.user.get_full_name() or obj.user.email

    user_display.short_description = _('User')

    def conversation_display(self, obj):
        return obj.conversation.name or f"Conversation {obj.conversation.id}"

    conversation_display.short_description = _('Conversation')


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'sender_display', 'conversation_display',
        'message_type', 'is_official', 'is_deleted', 'created_at'
    ]
    list_filter = ['message_type', 'is_official', 'is_deleted', 'created_at', 'is_read']
    search_fields = ['text', 'sender__first_name', 'sender__last_name', 'conversation__name']
    readonly_fields = ['created_at', 'updated_at', 'deleted_at', 'id']
    fieldsets = (
        (_('Message Information'), {
            'fields': ('id', 'conversation', 'sender', 'text', 'message_type')
        }),
        (_('Attachment'), {
            'fields': ('attachment',),
            'classes': ('collapse',)
        }),
        (_('Status'), {
            'fields': ('is_official', 'is_read', 'read_at')
        }),
        (_('Reply'), {
            'fields': ('reply_to',),
            'classes': ('collapse',)
        }),
        (_('Deletion'), {
            'fields': ('is_deleted', 'deleted_at'),
            'classes': ('collapse',)
        }),
        (_('Timestamps'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def sender_display(self, obj):
        return obj.sender.get_full_name() if obj.sender else 'Deleted User'

    sender_display.short_description = _('Sender')

    def conversation_display(self, obj):
        return obj.conversation.name or f"Conversation {obj.conversation.id}"

    conversation_display.short_description = _('Conversation')
