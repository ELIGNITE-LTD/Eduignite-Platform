from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

app_name = 'chat'

router = DefaultRouter()
router.register(r'conversations', views.ConversationViewSet, basename='conversation')
router.register(r'messages', views.MessageViewSet, basename='message')

urlpatterns = [
    # Always-available "message EduIgnite" channel -- deliberately NOT part
    # of the conversations router above, so it never inherits
    # ConversationViewSet's RequiresApp('chat') gate. See
    # ContactEduIgniteView's docstring for why ordinary chat can't be reused
    # for this. Placed before the router include, matching this codebase's
    # existing convention for additive endpoints elsewhere.
    path('contact-eduignite/', views.ContactEduIgniteView.as_view(), name='contact-eduignite'),
    path('', include(router.urls)),
]
