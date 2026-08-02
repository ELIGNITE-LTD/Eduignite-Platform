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
from .payunit_views import payunit_app_purchase, payunit_collect, payunit_school_subscription, payunit_status, payunit_webhook

router = DefaultRouter()
router.register(r'fee-structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'school-fee-assignments', SchoolFeeAssignmentViewSet, basename='school-fee-assignment')
router.register(r'student-school-fees', StudentSchoolFeeRecordViewSet, basename='student-school-fee')

urlpatterns = [
    path('payunit/collect/', payunit_collect, name='payunit-collect'),
    path('payunit/app-purchase/', payunit_app_purchase, name='payunit-app-purchase'),
    path('payunit/school-subscription/', payunit_school_subscription, name='payunit-school-subscription'),
    path('payunit/status/<str:transaction_id>/', payunit_status, name='payunit-status'),
    path('payunit/webhook/', payunit_webhook, name='payunit-webhook'),
    path('', include(router.urls)),
]
