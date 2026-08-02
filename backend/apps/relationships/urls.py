from django.urls import path

from .views import RelationshipSummaryView

app_name = 'relationships'

urlpatterns = [
    path('summary/', RelationshipSummaryView.as_view(), name='summary'),
]
