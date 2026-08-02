from django.contrib import admin
from .models import SupportContribution


@admin.register(SupportContribution)
class SupportContributionAdmin(admin.ModelAdmin):
    list_display = ['user', 'amount', 'currency', 'payment_method', 'status', 'created_at']
    list_filter = ['status', 'payment_method', 'currency', 'created_at']
    search_fields = ['user__first_name', 'user__last_name', 'phone', 'transaction_reference']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'
