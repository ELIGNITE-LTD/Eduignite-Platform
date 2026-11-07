from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import CursorPagination
from django.db import transaction
from django.db.models import Q, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .models import Conversation, ConversationParticipant, Message
from .serializers import (
    ConversationListSerializer,
    ConversationDetailSerializer,
    ConversationCreateSerializer,
    ConversationSettingsSerializer,
    MessageSerializer,
    MessageCreateSerializer,
    ParticipantSerializer,
    RelatedChatUserSerializer,
    TeacherGroupCreateSerializer,
)
from .tasks import send_offline_notification
from apps.users.models import User
from apps.students import api as students_api
from .relations import are_users_related, get_related_users, get_teacher_group_options, PRIMARY_FOUNDER_ROLES
from apps.registry.permissions import RequiresApp
from rest_framework.permissions import BasePermission
from rest_framework.views import APIView


EXECUTIVE_ROLES = {'CEO', 'CTO', 'COO', 'INV', 'DESIGNER', 'SUPER_ADMIN', 'SYSTEM_DEV'}

# Conversations of type 'support' (see Conversation.CONVERSATION_TYPE_CHOICES
# -- defined from the start but never actually created anywhere until
# ContactEduIgniteView below) are EduIgnite's own always-available "message
# EduIgnite" channel, exposed to the EduIgnite Companion app. Ordinary chat
# is gated by RequiresApp('chat') because it's an OPTIONAL marketplace app a
# school may or may not have installed -- but reaching EduIgnite itself is a
# core capability, not an optional app, and must work regardless of that
# entitlement (confirmed as a real production bug: an offline-focused school
# that never installed the general chat app got a 403 trying to message
# EduIgnite at all). This permission class enforces the ordinary
# RequiresApp('chat') gate for everything EXCEPT object-level access to a
# 'support' conversation (or a message inside one), which always passes.
class ChatAppOrSupportConversation(BasePermission):
    message = 'This app is not available for your school.'

    def has_permission(self, request, view):
        # list/create never reach has_object_permission below (DRF only
        # calls that for retrieve/update/destroy/detail actions, where
        # get_object() runs) -- MessageViewSet.list()/.create() both read
        # conversation_id straight from query_params/request.data
        # themselves (see those methods), so replicate that same lookup
        # here to catch the support-conversation carve-out before it would
        # otherwise be blocked outright.
        conversation_id = request.query_params.get('conversation_id') or request.data.get('conversation_id')
        if conversation_id and Conversation.objects.filter(
            id=conversation_id, conversation_type='support'
        ).exists():
            return True
        return RequiresApp('chat')().has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        conversation = obj if isinstance(obj, Conversation) else getattr(obj, 'conversation', None)
        if conversation is not None and conversation.conversation_type == 'support':
            return True
        return RequiresApp('chat')().has_permission(request, view)


class ContactEduIgniteView(APIView):
    """POST /api/v1/chat/contact-eduignite/ -- get-or-create the caller's own
    'support' conversation with EduIgnite (both CEO and CTO added as equal
    participants -- see the founder-parity rule; never just one). Always
    available to any authenticated user regardless of the 'chat' app
    entitlement -- see ChatAppOrSupportConversation above for why ordinary
    chat can't be used for this. One conversation per user, reused on repeat
    calls (idempotent)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        conversation = (
            Conversation.objects.filter(conversation_type='support', participants=user)
            .order_by('-created_at')
            .first()
        )
        if conversation is None:
            with transaction.atomic():
                conversation = Conversation.objects.create(
                    name='EduIgnite Support',
                    conversation_type='support',
                    school=getattr(user, 'school', None),
                    created_by=user,
                )
                conversation.add_participant(user, role='member')
                for founder in User.objects.filter(role__in=PRIMARY_FOUNDER_ROLES):
                    conversation.add_participant(founder, role='admin')
        serializer = ConversationDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class IsExecutiveUser(IsAuthenticated):
    """Only platform executive users may access internal live chat."""

    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and getattr(request.user, 'role', None) in EXECUTIVE_ROLES
        )


class MessageCursorPagination(CursorPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100
    ordering = '-created_at'


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationDetailSerializer
    permission_classes = [IsAuthenticated, ChatAppOrSupportConversation]

    def get_queryset(self):
        """Get conversations for current user."""
        user = self.request.user
        queryset = Conversation.objects.filter(
            participants=user,
            is_active=True
        ).select_related(
            'created_by',
            'school',
            'school_class',
            'subject',
        ).prefetch_related(
            Prefetch(
                'participant_records',
                ConversationParticipant.objects.select_related('user')
            ),
            'participants',
        ).order_by('-last_message_at', '-created_at')

        if user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            if not student:
                return queryset.none()
            queryset = queryset.filter(
                ~Q(conversation_type='group')
                | Q(school_class__isnull=True)
                | Q(school_class_id=student.school_class_id)
            )
        elif user.role == 'PARENT':
            class_ids = students_api.list_class_ids_for_guardian(user)
            queryset = queryset.filter(
                ~Q(conversation_type='group')
                | Q(school_class__isnull=True)
                | Q(school_class_id__in=class_ids)
            )

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return ConversationListSerializer
        elif self.action == 'create':
            return ConversationCreateSerializer
        return ConversationDetailSerializer

    def list(self, request, *args, **kwargs):
        """List user's conversations."""
        queryset = self.get_queryset()

        # Filter by conversation type if provided
        conversation_type = request.query_params.get('type')
        if conversation_type:
            queryset = queryset.filter(conversation_type=conversation_type)

        # Search by name or participant name
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(participants__name__icontains=search)
            ).distinct()

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Create a new conversation (DM or group chat)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        return Response(
            ConversationDetailSerializer(conversation, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    def retrieve(self, request, *args, **kwargs):
        """Get conversation detail with recent messages."""
        conversation = self.get_object()
        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='get-or-create-direct')
    def get_or_create_direct(self, request):
        """Get or create a direct message conversation with another user."""
        other_user_id = request.data.get('user_id')

        if not other_user_id:
            return Response(
                {'error': _('user_id is required')},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            other_user = User.objects.get(id=other_user_id)
        except User.DoesNotExist:
            return Response(
                {'error': _('User not found')},
                status=status.HTTP_404_NOT_FOUND
            )

        if other_user == request.user:
            return Response(
                {'error': _('Cannot create conversation with yourself')},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not are_users_related(request.user, other_user):
            return Response(
                {'error': _('You can only start conversations with related users.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check if conversation already exists
        conversation = Conversation.objects.filter(
            conversation_type='direct',
            participants=request.user
        ).filter(participants=other_user).first()

        if not conversation:
            # Create new direct conversation
            conversation = Conversation.objects.create(
                conversation_type='direct',
                created_by=request.user
            )
            conversation.add_participant(request.user, role='admin')
            conversation.add_participant(other_user, role='member')

        serializer = ConversationDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='related-users')
    def related_users(self, request):
        queryset = get_related_users(request.user)
        serializer = RelatedChatUserSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='teacher-group-options')
    def teacher_group_options(self, request):
        if request.user.role != 'TEACHER':
            return Response(
                {'error': _('Only teachers can create class groups.')},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(get_teacher_group_options(request.user))

    @action(detail=False, methods=['post'], url_path='create-teacher-group')
    def create_teacher_group(self, request):
        if request.user.role != 'TEACHER':
            return Response(
                {'error': _('Only teachers can create class groups.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TeacherGroupCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        class_subject = serializer.validated_data['class_subject']
        school_class = serializer.validated_data['school_class']
        subject = serializer.validated_data['subject']

        conversation_name = (
            serializer.validated_data.get('name', '').strip()
            or f'{subject.name} - {school_class.name}'
        )

        with transaction.atomic():
            conversation = Conversation.objects.create(
                name=conversation_name,
                conversation_type='group',
                school=request.user.school,
                school_class=school_class,
                subject=subject,
                created_by=request.user,
                only_admins_can_send=serializer.validated_data.get('only_admins_can_send', False),
            )
            conversation.add_participant(request.user, role='admin')

            student_user_ids = list(
                students_api.list_students(
                    school=request.user.school_id, school_class=school_class
                ).values_list('user_id', flat=True)
            )
            manual_participant_ids = serializer.validated_data.get('participant_ids', [])
            participant_ids = {str(user_id) for user_id in student_user_ids}
            participant_ids.update(str(user_id) for user_id in manual_participant_ids)
            participant_ids.discard(str(request.user.id))

            for participant in User.objects.filter(id__in=participant_ids):
                conversation.add_participant(participant, role='member')

        response = ConversationDetailSerializer(conversation, context={'request': request})
        return Response(response.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='messages')
    def messages(self, request, pk=None):
        """Get paginated message history for a conversation."""
        conversation = self.get_object()

        queryset = conversation.messages.filter(is_deleted=False).prefetch_related('reactions').order_by('-created_at')

        # Apply cursor pagination
        paginator = MessageCursorPagination()
        page = paginator.paginate_queryset(queryset, request)

        if page is not None:
            serializer = MessageSerializer(page, many=True, context={'request': request})
            return paginator.get_paginated_response(serializer.data)

        serializer = MessageSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='add-participant')
    def add_participant(self, request, pk=None):
        """Add a user to a group conversation."""
        conversation = self.get_object()

        if conversation.conversation_type != 'group':
            return Response(
                {'error': _('Participants can only be added to group conversations.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user is admin
        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user
            )
            if participant.role != 'admin':
                return Response(
                    {'error': _('You do not have permission to add participants')},
                    status=status.HTTP_403_FORBIDDEN
                )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )

        user_id = request.data.get('user_id')

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {'error': _('User not found')},
                status=status.HTTP_404_NOT_FOUND
            )

        if not are_users_related(request.user, user):
            return Response(
                {'error': _('You can only add related users to a conversation.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        conversation.add_participant(user, role='member')

        serializer = ParticipantSerializer(
            ConversationParticipant.objects.get(conversation=conversation, user=user)
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='remove-participant')
    def remove_participant(self, request, pk=None):
        conversation = self.get_object()
        participant_id = request.data.get('user_id')

        try:
            acting_participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user,
            )
            if acting_participant.role != 'admin':
                return Response(
                    {'error': _('You do not have permission to remove participants.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        target = get_object_or_404(ConversationParticipant, conversation=conversation, user_id=participant_id)
        if target.role == 'admin' and conversation.participant_records.filter(role='admin').count() <= 1:
            return Response(
                {'error': _('At least one admin must remain in the group.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='set-role')
    def set_role(self, request, pk=None):
        """Promote a member to admin or demote an admin back to member.
        Only existing admins may change roles (WhatsApp-style)."""
        conversation = self.get_object()
        try:
            acting = ConversationParticipant.objects.get(conversation=conversation, user=request.user)
            if acting.role != 'admin':
                return Response(
                    {'error': _('Only conversation admins can change roles.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_role = request.data.get('role')
        if new_role not in ('admin', 'member'):
            return Response({'error': _("Role must be 'admin' or 'member'.")}, status=status.HTTP_400_BAD_REQUEST)

        target = get_object_or_404(ConversationParticipant, conversation=conversation, user_id=request.data.get('user_id'))
        if new_role == 'member' and target.role == 'admin' and conversation.participant_records.filter(role='admin').count() <= 1:
            return Response({'error': _('At least one admin must remain in the group.')}, status=status.HTTP_400_BAD_REQUEST)

        target.role = new_role
        target.save(update_fields=['role', 'updated_at'])
        return Response(ParticipantSerializer(target, context={'request': request}).data)

    @action(detail=True, methods=['get', 'post'], url_path='typing')
    def typing(self, request, pk=None):
        """Cache-backed typing indicator (works without websockets).

        POST {is_typing: true|false} records that the caller is typing for a
        few seconds; GET returns the other participants currently typing."""
        from django.core.cache import cache

        conversation = self.get_object()
        if not ConversationParticipant.objects.filter(conversation=conversation, user=request.user).exists():
            return Response({'error': _('You are not a participant in this conversation.')}, status=status.HTTP_403_FORBIDDEN)

        key = f'typing:{conversation.id}'
        typing_map = cache.get(key) or {}
        now = timezone.now().timestamp()
        # Drop stale entries (older than 6s).
        typing_map = {uid: (name, ts) for uid, (name, ts) in typing_map.items() if now - ts < 6}

        if request.method == 'POST':
            if request.data.get('is_typing'):
                typing_map[str(request.user.id)] = (request.user.name, now)
            else:
                typing_map.pop(str(request.user.id), None)
            cache.set(key, typing_map, 10)

        others = [
            {'user_id': uid, 'user_name': name}
            for uid, (name, ts) in typing_map.items()
            if uid != str(request.user.id)
        ]
        return Response({'typing': others})

    @action(detail=True, methods=['patch'], url_path='settings')
    def update_settings(self, request, pk=None):
        conversation = self.get_object()
        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user,
            )
            if participant.role != 'admin':
                return Response(
                    {'error': _('Only conversation admins can update settings.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ConversationSettingsSerializer(conversation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ConversationDetailSerializer(conversation, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Leave a conversation."""
        conversation = self.get_object()

        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user
            )
            participant.delete()

            # If no more participants, deactivate conversation
            if conversation.participants.count() == 0:
                conversation.is_active = False
                conversation.save()

            return Response(status=status.HTTP_204_NO_CONTENT)

        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )

    @action(detail=True, methods=['post'])
    def mute(self, request, pk=None):
        """Toggle mute for a conversation."""
        conversation = self.get_object()

        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user
            )
            participant.is_muted = not participant.is_muted
            participant.save()

            serializer = ParticipantSerializer(participant)
            return Response(serializer.data)

        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        """Mark all messages in conversation as read."""
        conversation = self.get_object()

        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user
            )
            participant.mark_as_read()

            # Mark messages as read
            conversation.messages.filter(is_deleted=False).update(is_read=True)

            return Response({'status': 'Messages marked as read'})

        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated, ChatAppOrSupportConversation]

    def _conversation_allowed_for_user(self, conversation, user):
        if conversation.conversation_type != 'group' or not conversation.school_class_id:
            return True
        if user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            return bool(student and student.school_class_id == conversation.school_class_id)
        if user.role == 'PARENT':
            class_ids = students_api.list_class_ids_for_guardian(user)
            return conversation.school_class_id in class_ids
        return True

    def get_queryset(self):
        """Get messages filtered by conversation."""
        conversation_id = self.request.query_params.get('conversation_id')
        queryset = Message.objects.filter(is_deleted=False)

        if conversation_id:
            queryset = queryset.filter(conversation_id=conversation_id)

        user = self.request.user
        if user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            if not student:
                return queryset.none()
            queryset = queryset.filter(
                ~Q(conversation__conversation_type='group')
                | Q(conversation__school_class__isnull=True)
                | Q(conversation__school_class_id=student.school_class_id)
            )
        elif user.role == 'PARENT':
            class_ids = students_api.list_class_ids_for_guardian(user)
            queryset = queryset.filter(
                ~Q(conversation__conversation_type='group')
                | Q(conversation__school_class__isnull=True)
                | Q(conversation__school_class_id__in=class_ids)
            )

        # MessageSerializer.get_reactions() does obj.reactions.all() per
        # message; without this prefetch a page of MessageCursorPagination's
        # 50 messages issues 51 queries instead of 2 (ConversationViewSet's
        # own .messages action already prefetches this -- this queryset was
        # the one path that didn't).
        return queryset.select_related('sender', 'conversation').prefetch_related('reactions').order_by('-created_at')

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MessageCreateSerializer
        return MessageSerializer

    def list(self, request, *args, **kwargs):
        """List messages for a conversation."""
        conversation_id = request.query_params.get('conversation_id')

        if not conversation_id:
            return Response(
                {'error': _('conversation_id query parameter is required')},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is a participant
        try:
            participant_record = ConversationParticipant.objects.select_related('conversation').get(
                conversation_id=conversation_id,
                user=request.user
            )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )
        if not self._conversation_allowed_for_user(participant_record.conversation, request.user):
            return Response(
                {'error': _('This class group belongs to a previous class and is no longer available in your current account.')},
                status=status.HTTP_403_FORBIDDEN
            )

        queryset = self.get_queryset()

        # Apply cursor pagination
        paginator = MessageCursorPagination()
        page = paginator.paginate_queryset(queryset, request)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Send a message via REST API."""
        conversation_id = request.data.get('conversation_id')

        if not conversation_id:
            return Response(
                {'error': _('conversation_id is required')},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response(
                {'error': _('Conversation not found')},
                status=status.HTTP_404_NOT_FOUND
            )

        if not self._conversation_allowed_for_user(conversation, request.user):
            return Response(
                {'error': _('This class group belongs to a previous class and is no longer available in your current account.')},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check if user is a participant
        try:
            ConversationParticipant.objects.get(
                conversation=conversation,
                user=request.user
            )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )

        participant = ConversationParticipant.objects.get(
            conversation=conversation,
            user=request.user,
        )
        if conversation.only_admins_can_send and participant.role != 'admin':
            return Response(
                {'error': _('Only group administrators can send messages in this conversation.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            **serializer.validated_data
        )

        # Notify the other participants so their devices light up too.
        try:
            from apps.notifications.utils import notify_users

            recipients = [
                p.user for p in ConversationParticipant.objects.filter(
                    conversation=conversation, is_muted=False
                ).exclude(user=request.user).select_related('user')
            ]
            preview = (message.text or 'Sent an attachment')[:120]
            title = conversation.name if conversation.conversation_type != 'direct' else (request.user.name or 'New message')
            notify_users(
                recipients,
                f'New message from {request.user.name}' if conversation.conversation_type == 'direct' else f'{title}: new message',
                preview,
                notification_type='chat_message',
                sender=request.user,
            )
        except Exception:  # noqa: BLE001
            pass

        return Response(
            MessageSerializer(message, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    def destroy(self, request, *args, **kwargs):
        """Soft delete a message (sender or admin only)."""
        message = self.get_object()

        # Check if user is the sender or admin
        if message.sender != request.user:
            try:
                participant = ConversationParticipant.objects.get(
                    conversation=message.conversation,
                    user=request.user
                )
                if participant.role != 'admin':
                    return Response(
                        {'error': _('You can only delete your own messages')},
                        status=status.HTTP_403_FORBIDDEN
                    )
            except ConversationParticipant.DoesNotExist:
                return Response(
                    {'error': _('You are not a participant in this conversation')},
                    status=status.HTTP_403_FORBIDDEN
                )

        message.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='attachment-file', permission_classes=[])
    def attachment_file(self, request, pk=None):
        """Serve a message attachment as raw bytes. WebView <img> tags and
        system-browser downloads cannot send Authorization headers, so this
        endpoint also accepts the access token as a ?jwt= query parameter."""
        import base64 as _b64

        from django.http import Http404, HttpResponse
        from rest_framework_simplejwt.authentication import JWTAuthentication

        user = request.user if request.user.is_authenticated else None
        if user is None:
            token = request.query_params.get('jwt', '')
            if token:
                try:
                    auth = JWTAuthentication()
                    validated = auth.get_validated_token(token)
                    user = auth.get_user(validated)
                except Exception:  # noqa: BLE001
                    user = None
        if user is None:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        message = Message.objects.filter(pk=pk, is_deleted=False).select_related('conversation').first()
        if not message:
            raise Http404
        if not ConversationParticipant.objects.filter(conversation=message.conversation, user=user).exists():
            return Response({'detail': 'Not a participant.'}, status=status.HTTP_403_FORBIDDEN)

        want_json = request.query_params.get('as') == 'json'
        if message.attachment_data and ';base64,' in message.attachment_data:
            header, payload = message.attachment_data.split(';base64,', 1)
            mime = header[5:] or 'application/octet-stream'
            if want_json:
                # WebView-safe path: the client renders the data URL directly
                # in <img>/<a>, avoiding cross-origin binary quirks on mobile.
                return Response({
                    'data_url': message.attachment_data,
                    'name': message.attachment_name or 'attachment',
                    'mime': mime,
                })
            try:
                blob = _b64.b64decode(payload)
            except Exception:  # noqa: BLE001
                raise Http404
            response = HttpResponse(blob, content_type=mime)
            name = message.attachment_name or 'attachment'
            disposition = 'inline' if mime.startswith('image/') else 'attachment'
            response['Content-Disposition'] = f'{disposition}; filename="{name}"'
            response['Cache-Control'] = 'private, max-age=86400'
            return response
        if message.attachment:
            from django.shortcuts import redirect

            return redirect(message.attachment.url)

        # No stored data or file. If this message carried an attachment, it was
        # cleared by the 1-month chat-file retention job — tell the client so it
        # can ask the sender to resend, instead of a generic error.
        if message.attachment_name or message.message_type in ('image', 'file'):
            if want_json:
                return Response({
                    'expired': True,
                    'name': message.attachment_name or 'attachment',
                    'detail': 'This file is no longer available. Please ask the sender to resend it.',
                })
            return Response(
                {'detail': 'This file is no longer available. Please ask the sender to resend it.'},
                status=status.HTTP_410_GONE,
            )
        raise Http404

    @action(detail=True, methods=['post'], url_path='react')
    def react(self, request, pk=None):
        """Toggle an emoji reaction on a message (WhatsApp-style).

        Sending the same emoji again removes it; a different emoji replaces the
        caller's existing reaction. Returns the updated message."""
        from .models import MessageReaction

        message = self.get_object()
        emoji = str(request.data.get('emoji', '')).strip()
        if not emoji:
            return Response({'error': _('An emoji is required.')}, status=status.HTTP_400_BAD_REQUEST)

        # The viewer must belong to the conversation.
        if not ConversationParticipant.objects.filter(
            conversation=message.conversation, user=request.user
        ).exists():
            return Response(
                {'error': _('You are not a participant in this conversation.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        existing = MessageReaction.objects.filter(message=message, user=request.user).first()
        if existing and existing.emoji == emoji:
            existing.delete()
        else:
            MessageReaction.objects.update_or_create(
                message=message, user=request.user, defaults={'emoji': emoji}
            )

        message = Message.objects.prefetch_related('reactions').get(id=message.id)
        return Response(MessageSerializer(message, context={'request': request}).data)

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Search messages in a conversation."""
        query = request.query_params.get('q', '')
        conversation_id = request.query_params.get('conversation_id')

        if not query or not conversation_id:
            return Response(
                {'error': _('q and conversation_id parameters are required')},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is a participant
        try:
            participant_record = ConversationParticipant.objects.select_related('conversation').get(
                conversation_id=conversation_id,
                user=request.user
            )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {'error': _('You are not a participant in this conversation')},
                status=status.HTTP_403_FORBIDDEN
            )
        if not self._conversation_allowed_for_user(participant_record.conversation, request.user):
            return Response(
                {'error': _('This class group belongs to a previous class and is no longer available in your current account.')},
                status=status.HTTP_403_FORBIDDEN
            )

        queryset = Message.objects.filter(
            conversation_id=conversation_id,
            is_deleted=False,
            text__icontains=query
        ).order_by('-created_at')

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
