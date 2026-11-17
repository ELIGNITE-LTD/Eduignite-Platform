from django.urls import path

from . import views

app_name = 'ai_marking'

urlpatterns = [
    path('jobs/', views.JobListCreateView.as_view(), name='jobs'),
    path('jobs/<uuid:pk>/', views.JobDetailView.as_view(), name='job'),
    path('jobs/<uuid:pk>/start/', views.JobStartView.as_view(), name='start'),
    path('jobs/<uuid:pk>/approve-all/', views.JobApproveAllView.as_view(), name='approve-all'),
    path('jobs/<uuid:pk>/publish/', views.JobPublishView.as_view(), name='publish'),
    path('jobs/<uuid:pk>/pdf/', views.JobPdfView.as_view(), name='job-pdf'),
    path('scripts/<uuid:pk>/', views.ScriptView.as_view(), name='script'),
    path('scripts/<uuid:pk>/approve/', views.ScriptApproveView.as_view(), name='script-approve'),
    path('scripts/<uuid:pk>/pdf/', views.ScriptPdfView.as_view(), name='script-pdf'),
    path('challenges/', views.ChallengeListView.as_view(), name='challenges'),
    path('challenges/<uuid:pk>/respond/', views.ChallengeRespondView.as_view(), name='challenge-respond'),
    path('my/', views.MyScriptsView.as_view(), name='my'),
    path('my/<uuid:pk>/', views.MyScriptDetailView.as_view(), name='my-detail'),
    path('my/<uuid:pk>/pdf/', views.MyScriptPdfView.as_view(), name='my-pdf'),
    path('my/<uuid:pk>/challenge/', views.MyScriptChallengeView.as_view(), name='my-challenge'),
]
