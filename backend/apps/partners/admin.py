from django.contrib import admin

from .models import Partner, PartnerApplication, PartnerType, ReferralClick


@admin.register(PartnerType)
class PartnerTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'order', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name',)
    list_editable = ('is_active', 'order')


@admin.register(PartnerApplication)
class PartnerApplicationAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'organization_name', 'applicant_kind', 'partner_type_name', 'status', 'created_at')
    list_filter = ('status', 'applicant_kind', 'partner_type')
    search_fields = ('full_name', 'email', 'organization_name')
    readonly_fields = ('created_at', 'updated_at', 'reviewed_at', 'approved_at')


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'applicant_kind', 'status', 'is_public', 'last_activity_at', 'created_at')
    list_filter = ('status', 'applicant_kind', 'is_public')
    search_fields = ('display_name', 'user__email', 'public_name')


@admin.register(ReferralClick)
class ReferralClickAdmin(admin.ModelAdmin):
    list_display = ('referral_code', 'partner', 'created_at')
    search_fields = ('referral_code',)
