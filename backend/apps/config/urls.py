from django.urls import path
from .views import cameroon_config, school_config

app_name = 'config'

urlpatterns = [
    path('cameroon/', cameroon_config, name='cameroon-config'),
    path('school-data/', school_config, name='school-config'),
]
