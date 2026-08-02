from django.contrib import admin
from .models import FeeStructure, Payment, Invoice


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = ['name', 'role', 'amount', 'currency', 'academic_year', 'school', 'is_mandatory']
    list_filter = ['school', 'role', 'academic_year', 'is_mandatory', 'created']
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'created', 'modified']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['reference_number', 'payer', 'amount', 'currency', 'payment_method', 'status', 'payment_date']
    list_filter = ['school', 'status', 'payment_method', 'payment_date', 'created']
    search_fields = ['reference_number', 'payer__first_name', 'payer__last_name', 'payer__email']
    readonly_fields = ['id', 'reference_number', 'created', 'modified']
    fieldsets = (
        ('Payment Information', {
            'fields': ('id', 'reference_number', 'school', 'payer', 'fee_structure')
        }),
        ('Amount and Currency', {
            'fields': ('amount', 'currency')
        }),
        ('Payment Details', {
            'fields': ('payment_method', 'payment_date', 'status', 'receipt_number')
        }),
        ('Processing', {
            'fields': ('bursar', 'confirmed_at', 'notes')
        }),
        ('Timestamps', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        })
    )


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'payment', 'issued_at', 'issued_by']
    list_filter = ['issued_at', 'created']
    search_fields = ['invoice_number', 'payment__reference_number']
    readonly_fields = ['id', 'invoice_number', 'issued_at', 'created']
