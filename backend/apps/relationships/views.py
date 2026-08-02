from rest_framework import permissions, views
from rest_framework.response import Response

from apps.chat.relations import describe_relationships, get_related_users
from apps.registry.permissions import RequiresApp


class RelationshipSummaryView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, RequiresApp('relationships')]

    def get(self, request):
        users = get_related_users(request.user)[:100]
        return Response({
            'user': str(request.user.id),
            'relationships': [
                {
                    'id': str(user.id),
                    'name': user.name,
                    'role': user.role,
                    'labels': describe_relationships(request.user, user),
                    'school_id': str(user.school_id) if user.school_id else None,
                }
                for user in users
            ],
        })
