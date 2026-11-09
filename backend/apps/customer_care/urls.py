from django.urls import path

from . import views as v

app_name = 'customer_care'

urlpatterns = [
    # public (no auth)
    path('public/contact-info/', v.PublicContactInfoView.as_view(), name='public-contact-info'),
    path('webhooks/whatsapp/', v.WhatsAppWebhookView.as_view(), name='whatsapp-webhook'),
    # who am I (any signed-in user)
    path('me/', v.MeView.as_view(), name='me'),
    # customer side: strictly own data
    path('my/conversations/', v.MyConversationsView.as_view(), name='my-conversations'),
    path('my/conversations/<uuid:pk>/', v.MyConversationDetailView.as_view(), name='my-conversation'),
    path('my/conversations/<uuid:pk>/messages/', v.MyMessagesView.as_view(), name='my-messages'),
    path('my/conversations/<uuid:pk>/read/', v.MyReadView.as_view(), name='my-read'),
    path('my/unread/', v.MyUnreadView.as_view(), name='my-unread'),
    # executive side (module customer_care)
    path('overview/', v.OverviewView.as_view(), name='overview'),
    path('conversations/', v.ConversationListView.as_view(), name='conversations'),
    path('conversations/<uuid:pk>/', v.ConversationDetailView.as_view(), name='conversation'),
    path('conversations/<uuid:pk>/messages/', v.StaffMessagesView.as_view(), name='messages'),
    path('conversations/<uuid:pk>/messages/<int:message_id>/retry-email/', v.RetryEmailView.as_view(),
         name='retry-email'),
    path('conversations/<uuid:pk>/whatsapp/prepare/', v.WhatsAppPrepareView.as_view(), name='whatsapp-prepare'),
    path('conversations/<uuid:pk>/messages/<int:message_id>/whatsapp-outcome/', v.WhatsAppOutcomeView.as_view(),
         name='whatsapp-outcome'),
    path('conversations/<uuid:pk>/status/', v.StatusView.as_view(), name='status'),
    path('conversations/<uuid:pk>/resolve/', v.ResolveView.as_view(), name='resolve'),
    path('conversations/<uuid:pk>/reopen/', v.ReopenView.as_view(), name='reopen'),
    path('conversations/<uuid:pk>/follow-up/', v.FollowUpView.as_view(), name='follow-up'),
    path('conversations/<uuid:pk>/notes/', v.NotesView.as_view(), name='notes'),
    path('conversations/<uuid:pk>/read/', v.StaffReadView.as_view(), name='read'),
    path('conversations/<uuid:pk>/claim/', v.ClaimView.as_view(), name='claim'),
    path('conversations/<uuid:pk>/assign/', v.AssignView.as_view(), name='assign'),
    path('groups/', v.GroupListView.as_view(), name='groups'),
    path('groups/<uuid:pk>/', v.GroupDetailView.as_view(), name='group'),
    path('groups/<uuid:pk>/assignments/', v.GroupAssignmentsView.as_view(), name='group-assignments'),
    path('groups/<uuid:pk>/assignments/<uuid:assignment_id>/', v.GroupAssignmentEndView.as_view(),
         name='group-assignment-end'),
    path('executives/', v.ExecutivesView.as_view(), name='executives'),
    path('audit/', v.AuditView.as_view(), name='audit'),
    path('config-status/', v.ConfigStatusView.as_view(), name='config-status'),
    path('contact-info/', v.ContactInfoListView.as_view(), name='contact-info'),
    path('contact-info/<uuid:pk>/', v.ContactInfoDetailView.as_view(), name='contact-info-detail'),
]
