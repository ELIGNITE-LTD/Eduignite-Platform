from django.urls import path

from . import views

app_name = 'site_oversight'

urlpatterns = [
    path('mine/', views.MineView.as_view(), name='mine'),
    path('schools/', views.SchoolListView.as_view(), name='schools'),
    path('schools/<str:school_id>/timeline/', views.TimelineView.as_view(), name='timeline'),
    path('schools/<str:school_id>/block/', views.BlockView.as_view(), name='block'),
    path('schools/<str:school_id>/unblock/', views.UnblockView.as_view(), name='unblock'),
    path('schools/<str:school_id>/resolution/', views.ResolutionStepsView.as_view(), name='resolution'),
    path('schools/<str:school_id>/publish/', views.PublishView.as_view(), name='publish'),
    path('schools/<str:school_id>/unpublish/', views.UnpublishView.as_view(), name='unpublish'),
]
