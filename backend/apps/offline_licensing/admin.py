from django.contrib import admin

from .models import (
    DeviceRegistration,
    LicenseIssuance,
    LicensePlanPricing,
    MigrationJob,
    QRChallenge,
    SyncChunk,
    SyncSession,
)


@admin.register(DeviceRegistration)
class DeviceRegistrationAdmin(admin.ModelAdmin):
    list_display = ('device_id', 'school', 'status', 'registered_at')
    list_filter = ('status',)
    search_fields = ('device_id', 'school__id', 'school__name')
    readonly_fields = ('id', 'registered_at')


@admin.register(LicensePlanPricing)
class LicensePlanPricingAdmin(admin.ModelAdmin):
    """Configurable per spec section 5 — seasonal discounts and regional
    pricing are edited here, never hardcoded in any client."""

    list_display = ('plan', 'price', 'currency', 'region', 'active', 'effective_from')
    list_filter = ('plan', 'active', 'currency')
    search_fields = ('region', 'note')
    ordering = ('-effective_from',)


@admin.register(QRChallenge)
class QRChallengeAdmin(admin.ModelAdmin):
    list_display = ('challenge_id', 'school', 'purpose', 'device_id', 'created_at', 'expires_at', 'used_at')
    list_filter = ('purpose',)
    search_fields = ('challenge_id', 'device_id', 'school__id')
    readonly_fields = ('id', 'challenge_id', 'nonce', 'used_at', 'redeemed_by')


@admin.register(LicenseIssuance)
class LicenseIssuanceAdmin(admin.ModelAdmin):
    list_display = ('school', 'device', 'plan', 'issued_at', 'expires_at', 'revoked')
    list_filter = ('plan', 'revoked')
    search_fields = ('school__id', 'device__device_id')
    readonly_fields = ('id', 'certificate_json', 'created_at')


@admin.register(SyncSession)
class SyncSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'school', 'device', 'status', 'created_at', 'completed_at')
    list_filter = ('status',)
    search_fields = ('school__id', 'device__device_id')


@admin.register(SyncChunk)
class SyncChunkAdmin(admin.ModelAdmin):
    list_display = ('session', 'chunk_index', 'total_chunks', 'row_count', 'received_at')
    search_fields = ('session__id',)


@admin.register(MigrationJob)
class MigrationJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'school', 'status', 'created_by', 'created_at')
    list_filter = ('status',)
    search_fields = ('school__id', 'school__name')
    readonly_fields = ('id', 'report_json', 'created_at')
