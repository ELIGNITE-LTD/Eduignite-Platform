from django.contrib import admin
from .models import Feedback, FeedbackResponse


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ['subject', 'sender', 'status', 'priority', 'created_at']
    list_filter = ['school', 'status', 'priority', 'created_at']
    search_fields = ['subject', 'message', 'sender__first_name', 'sender__last_name']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'


@admin.register(FeedbackResponse)
class FeedbackResponseAdmin(admin.ModelAdmin):
    list_display = ['feedback', 'responder', 'created_at']
    list_filter = ['created_at']
    search_fields = ['feedback__subject', 'responder__first_name', 'responder__last_name']
    readonly_fields = ['created_at', 'updated_at']
