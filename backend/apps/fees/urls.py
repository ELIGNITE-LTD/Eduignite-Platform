from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'fees'
from .views import (
    FeeStructureViewSet,
    PaymentViewSet,
    InvoiceViewSet,
    SchoolFeeAssignmentViewSet,
    StudentSchoolFeeRecordViewSet,
    verify_receipt,
)
from .fapshi_views import (
    fapshi_app_purchase,
    fapshi_collect,
    fapshi_school_subscription,
    fapshi_status,
    fapshi_webhook,
)

router = DefaultRouter()
router.register(r'fee-structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'school-fee-assignments', SchoolFeeAssignmentViewSet, basename='school-fee-assignment')
router.register(r'student-school-fees', StudentSchoolFeeRecordViewSet, basename='student-school-fee')

urlpatterns = [
    # Fapshi is the only gateway: it collects for every purpose (platform
    # charge, app purchase, school subscription, AI credits).
    path('fapshi/collect/', fapshi_collect, name='fapshi-collect'),
    path('fapshi/app-purchase/', fapshi_app_purchase, name='fapshi-app-purchase'),
    path('fapshi/school-subscription/', fapshi_school_subscription, name='fapshi-school-subscription'),
    path('fapshi/status/<str:transaction_id>/', fapshi_status, name='fapshi-status'),
    path('fapshi/webhook/', fapshi_webhook, name='fapshi-webhook'),
    path('verify-receipt/<str:token>/', verify_receipt, name='verify-receipt'),
    path('', include(router.urls)),
]
