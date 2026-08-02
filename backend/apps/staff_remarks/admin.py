from django.contrib import admin
from .models import StaffRemark


@admin.register(StaffRemark)
class StaffRemarkAdmin(admin.ModelAdmin):
    list_display = ['staff', 'admin', 'remark_type', 'is_confidential', 'acknowledged', 'created_at']
    list_filter = ['school', 'remark_type', 'is_confidential', 'acknowledged', 'created_at']
    search_fields = ['staff__first_name', 'staff__last_name', 'admin__first_name', 'admin__last_name', 'text']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'
