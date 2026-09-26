from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'fees'
from .views import (
    FeeStructureViewSet,
    PaymentViewSet,
    InvoiceViewSet,
    SchoolFeeAssignmentViewSet,
    StudentSchoolFeeRecordViewSet,
)
from .fapshi_views import fapshi_collect, fapshi_status, fapshi_webhook
from .payunit_views import payunit_app_purchase, payunit_collect, payunit_school_subscription, payunit_status, payunit_webhook

router = DefaultRouter()
router.register(r'fee-structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'school-fee-assignments', SchoolFeeAssignmentViewSet, basename='school-fee-assignment')
router.register(r'student-school-fees', StudentSchoolFeeRecordViewSet, basename='student-school-fee')

urlpatterns = [
    # Fapshi collects today. The PayUnit paths below stay reachable only so
    # that a payment already in flight during the switch can still finish;
    # nothing new is started through them.
    path('fapshi/collect/', fapshi_collect, name='fapshi-collect'),
    path('fapshi/status/<str:transaction_id>/', fapshi_status, name='fapshi-status'),
    path('fapshi/webhook/', fapshi_webhook, name='fapshi-webhook'),

    path('payunit/collect/', payunit_collect, name='payunit-collect'),
    path('payunit/app-purchase/', payunit_app_purchase, name='payunit-app-purchase'),
    path('payunit/school-subscription/', payunit_school_subscription, name='payunit-school-subscription'),
    path('payunit/status/<str:transaction_id>/', payunit_status, name='payunit-status'),
    path('payunit/webhook/', payunit_webhook, name='payunit-webhook'),
    path('', include(router.urls)),
]
