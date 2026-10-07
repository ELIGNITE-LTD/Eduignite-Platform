from django.contrib import admin

from .models import InvestmentInterest, PartnerProfile


@admin.register(PartnerProfile)
class PartnerProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'phone', 'country', 'created_at')
    search_fields = ('user__name', 'user__email', 'organization', 'phone')


@admin.register(InvestmentInterest)
class InvestmentInterestAdmin(admin.ModelAdmin):
    list_display = ('partner', 'amount', 'currency', 'status', 'created_at')
    list_filter = ('status', 'currency')
    search_fields = ('partner__name', 'partner__email')
    list_editable = ('status',)
