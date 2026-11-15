"""Mounted at ``/api/v1/outreach/`` by ``config.urls``."""

from django.urls import path

from . import views

app_name = 'outreach'

urlpatterns = [
    path('summary/', views.SummaryView.as_view(), name='summary'),
    path('contacts/', views.ContactListCreateView.as_view(), name='contacts'),
    path('contacts/import/', views.ContactImportView.as_view(), name='contacts-import'),
    path('contacts/<uuid:pk>/', views.ContactDetailView.as_view(), name='contact'),
    path('send/', views.SendView.as_view(), name='send'),
    path('send/test/', views.TestSendView.as_view(), name='send-test'),
    path('send/cancel/', views.CancelView.as_view(), name='send-cancel'),
    path('campaigns/', views.CampaignListView.as_view(), name='campaigns'),
    path('unsubscribe/<str:token>/', views.UnsubscribeView.as_view(), name='unsubscribe'),
]
