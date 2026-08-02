from django.contrib import admin
from .models import Order


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'school_name', 'email', 'whatsapp_number', 'status', 'created_at']
    list_filter = ['status', 'created_at', 'region']
    search_fields = ['full_name', 'school_name', 'email', 'whatsapp_number']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'
