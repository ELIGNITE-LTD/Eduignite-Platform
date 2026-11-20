from django.urls import path

from . import views

app_name = 'watch'

urlpatterns = [
    path('overview/', views.OverviewView.as_view(), name='overview'),
    path('incidents/', views.IncidentListView.as_view(), name='incidents'),
    path('incidents/<uuid:pk>/', views.IncidentDetailView.as_view(), name='incident'),
    path('incidents/<uuid:pk>/action/', views.IncidentActionView.as_view(), name='incident-action'),
    path('run-checks/', views.RunChecksView.as_view(), name='run-checks'),
    path('test-alert/', views.TestAlertView.as_view(), name='test-alert'),
    path('alerts/', views.AlertLogView.as_view(), name='alerts'),
    path('client-errors/', views.ClientErrorView.as_view(), name='client-errors'),
    path('ping/', views.PingView.as_view(), name='ping'),
]
