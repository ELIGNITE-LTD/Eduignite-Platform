from rest_framework import serializers
from django.utils.translation import gettext_lazy as _
from apps.grades.models import Subject
from apps.schools.models import SchoolClass
from apps.users.models import User
from .models import Conversation, ConversationParticipant, Message
from .relations import PRIMARY_FOUNDER_ROLES, are_users_related, describe_relationships


def _is_masked_founder_message(message) -> bool:
    """True when this message was sent by a primary founder (CEO/CTO) inside
    a 'support' (school <-> EduIgnite) conversation -- product requirement:
    a school must only ever see "EduIgnite" as the sender, never which
    individual founder replied, and this applies identically to the
    founders' OWN view of their own sent messages (every client renders the
    same serialized output, so masking here is the one place that covers
    all of them -- the mobile app companion included).
    Ordinary conversations (direct/group/official) are never affected."""
    return bool(
        message.sender_id
        and message.sender.role in PRIMARY_FOUNDER_ROLES
        and message.conversation_id
        and message.conversation.conversation_type == 'support'
    )


class ParticipantSerializer(serializers.ModelSerializer):
    user_id = serializers.CharField(source='user.id', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_avatar = serializers.SerializerMethodField()
    user_email = serializers.EmailField(source='user.email', read_only=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = ConversationParticipant
        fields = ['user_id', 'user_name', 'user_avatar', 'user_email', 'role', 'is_online', 'joined_at', 'is_muted', 'last_read_at']
        read_only_fields = ['joined_at', 'last_read_at']

    def get_user_avatar(self, obj):
        # avatar is a URLField (plain string) — return directly, no .url needed
        return obj.user.avatar or None

    def get_is_online(self, obj):
        # Real presence: a participant is only "online" when their cache
        # heartbeat is still alive (see apps/chat/presence.py). Previously this
        # method was missing, so the field never reflected true presence.
        from .presence import is_online
        return is_online(str(obj.user_id))


class MessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.CharField(source='sender.id', read_only=True)
    has_attachment = serializers.SerializerMethodField()
    sender_name = serializers.SerializerMethodField()
    sender_avatar = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()
    reply_to_text = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    # Branding shown in place of a founder's real identity in a 'support'
    # conversation -- see _is_masked_founder_message().
    MASKED_SENDER_NAME = 'EduIgnite'
    MASKED_SENDER_ROLE = 'EDUIGNITE'

    class Meta:
        model = Message
        fields = [
            'id', 'sender_id', 'sender_name', 'sender_avatar', 'text',
            'message_type', 'attachment', 'attachment_name', 'has_attachment', 'sender_role', 'is_official', 'created_at',
            'is_read', 'read_at', 'reply_to', 'reply_to_text', 'is_deleted', 'reactions'
        ]
        read_only_fields = ['id', 'sender_id', 'sender_name', 'sender_avatar', 'created_at', 'is_read', 'read_at', 'is_deleted']

    def get_reactions(self, obj):
        """Aggregate reactions as [{emoji, count, user_ids, reacted}] so the UI
        can render WhatsApp-style reaction pills and highlight the viewer's own."""
        request = self.context.get('request')
        me = str(getattr(getattr(request, 'user', None), 'id', '') or '')
        buckets: dict = {}
        for reaction in obj.reactions.all():
            entry = buckets.setdefault(reaction.emoji, {'emoji': reaction.emoji, 'count': 0, 'user_ids': [], 'reacted': False})
            entry['count'] += 1
            uid = str(reaction.user_id)
            entry['user_ids'].append(uid)
            if uid == me:
                entry['reacted'] = True
        return list(buckets.values())

    def get_sender_name(self, obj):
        if _is_masked_founder_message(obj):
            return self.MASKED_SENDER_NAME
        return obj.sender.name if obj.sender else None

    def get_sender_role(self, obj):
        if _is_masked_founder_message(obj):
            return self.MASKED_SENDER_ROLE
        return obj.sender.role if obj.sender else None

    def get_sender_avatar(self, obj):
        if _is_masked_founder_message(obj):
            return None  # frontends already fall back to initials from sender_name ("EduIgnite" -> "EI") when this is null
        return (obj.sender.avatar if obj.sender else None) or None

    def get_has_attachment(self, obj):
        return bool(obj.attachment_data) or bool(obj.attachment)

    def get_reply_to_text(self, obj):
        if obj.reply_to and not obj.reply_to.is_deleted:
            return obj.reply_to.text[:100]
        return None


class MessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['text', 'message_type', 'attachment', 'reply_to', 'attachment_data', 'attachment_name']

    def validate(self, data):
        attachment_data = data.get('attachment_data') or ''
        if attachment_data:
            if not attachment_data.startswith('data:') or ';base64,' not in attachment_data:
                raise serializers.ValidationError({'attachment_data': _('Attachment must be a base64 data URL.')})
            if len(attachment_data) > 15 * 1024 * 1024:
                raise serializers.ValidationError({'attachment_data': _('Attachments are limited to 10 MB.')})
        if not data.get('text') and not data.get('attachment') and not attachment_data:
            raise serializers.ValidationError(
                _('Either text or attachment must be provided.')
            )
        return data


class ConversationListSerializer(serializers.ModelSerializer):
    participants = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    only_admins_can_send = serializers.BooleanField(read_only=True)
    admin_participant_ids = serializers.ListField(read_only=True)
    is_current_user_admin = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'name', 'conversation_type', 'participants', 'participant_count',
            'last_message', 'last_message_at', 'unread_count', 'created_by_name',
            'school_class_name', 'subject_name', 'only_admins_can_send',
            'admin_participant_ids', 'is_current_user_admin', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_is_current_user_admin(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not getattr(user, 'is_authenticated', False):
            return False
        return obj.participant_records.filter(user=user, role='admin').exists()

    def get_participants(self, obj):
        """Get first 3 participants."""
        participants = obj.participants.all()[:3]
        return [
            {
                'id': str(p.id),
                'name': p.name,
                'avatar': p.avatar or None,  # URLField is a plain string
            }
            for p in participants
        ]

    def get_participant_count(self, obj):
        return obj.participants.count()

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.get_unread_count(request.user)
        return 0


class ConversationDetailSerializer(serializers.ModelSerializer):
    participants = ParticipantSerializer(
        source='participant_records',
        many=True,
        read_only=True
    )
    recent_messages = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    only_admins_can_send = serializers.BooleanField(read_only=True)
    admin_participant_ids = serializers.ListField(read_only=True)
    is_current_user_admin = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'name', 'conversation_type', 'school', 'created_by', 'created_by_name',
            'school_class', 'school_class_name', 'subject', 'subject_name',
            'participants', 'last_message', 'last_message_at', 'is_active',
            'only_admins_can_send', 'admin_participant_ids', 'is_current_user_admin',
            'created_at', 'updated_at', 'recent_messages'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_recent_messages(self, obj):
        """Get 20 most recent messages."""
        messages = obj.messages.filter(is_deleted=False).order_by('-created_at')[:20]
        return MessageSerializer(messages, many=True, context=self.context).data

    def get_is_current_user_admin(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not getattr(user, 'is_authenticated', False):
            return False
        return obj.participant_records.filter(user=user, role='admin').exists()


class ConversationCreateSerializer(serializers.ModelSerializer):
    participant_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=True
    )

    class Meta:
        model = Conversation
        fields = ['name', 'conversation_type', 'school', 'school_class', 'subject', 'only_admins_can_send', 'participant_ids']

    def validate_participant_ids(self, value):
        if not value:
            raise serializers.ValidationError(_('At least one participant is required.'))

        # Validate all users exist
        users = User.objects.filter(id__in=value)
        if len(users) != len(value):
            raise serializers.ValidationError(_('Some participants do not exist.'))

        return value

    def validate(self, attrs):
        request = self.context.get('request')
        participant_ids = attrs.get('participant_ids', [])
        participants = User.objects.filter(id__in=participant_ids)
        for participant in participants:
            if not are_users_related(request.user, participant):
                raise serializers.ValidationError(
                    {'participant_ids': _('You can only start conversations with related users.')}
                )

        if attrs.get('conversation_type') == 'direct' and len(participant_ids) != 1:
            raise serializers.ValidationError({'participant_ids': _('Direct conversations require exactly one recipient.')})

        if attrs.get('conversation_type') == 'group' and not (attrs.get('name') or '').strip():
            raise serializers.ValidationError({'name': _('Group conversations require a name.')})

        return attrs

    def create(self, validated_data):
        participant_ids = validated_data.pop('participant_ids')
        request = self.context.get('request')

        # Create conversation
        conversation = Conversation.objects.create(
            created_by=request.user,
            school=getattr(request.user, 'school', None),
            **validated_data
        )

        # Add participants
        for user_id in participant_ids:
            user = User.objects.get(id=user_id)
            conversation.add_participant(user, role='member')

        # Add creator as admin
        conversation.add_participant(request.user, role='admin')

        return conversation


class RelatedChatUserSerializer(serializers.ModelSerializer):
    relationship_labels = serializers.SerializerMethodField()
    school_name = serializers.CharField(source='school.name', read_only=True)
    sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'matricule',
            'name',
            'email',
            'role',
            'avatar',
            'school_name',
            'sub_school_name',
            'relationship_labels',
            'is_online',
        ]

    is_online = serializers.SerializerMethodField()

    def get_is_online(self, obj):
        from .presence import is_online
        return is_online(str(obj.id))

    def get_relationship_labels(self, obj):
        request = self.context.get('request')
        return describe_relationships(request.user, obj)


class TeacherGroupCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.none())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.none())
    only_admins_can_send = serializers.BooleanField(default=False)
    participant_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if getattr(user, 'school_id', None):
            from apps.grades.models import ClassSubject, Subject
            from apps.schools.models import SchoolClass

            taught_class_ids = ClassSubject.objects.filter(teacher=user).values_list('school_class_id', flat=True)
            taught_subject_ids = ClassSubject.objects.filter(teacher=user).values_list('subject_id', flat=True)
            self.fields['school_class'].queryset = SchoolClass.objects.filter(id__in=taught_class_ids).order_by('name')
            self.fields['subject'].queryset = Subject.objects.filter(id__in=taught_subject_ids).order_by('name')

    def validate(self, attrs):
        from apps.grades.models import ClassSubject

        request = self.context.get('request')
        user = request.user
        class_subject = ClassSubject.objects.filter(
            teacher=user,
            school_class=attrs['school_class'],
            subject=attrs['subject'],
        ).first()
        if not class_subject:
            raise serializers.ValidationError('You can only create groups for subjects you teach in that class.')

        participants = User.objects.filter(id__in=attrs.get('participant_ids', []))
        for participant in participants:
            if not are_users_related(user, participant):
                raise serializers.ValidationError({'participant_ids': 'All participants must be related to you.'})

        attrs['class_subject'] = class_subject
        return attrs


class ConversationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ['name', 'only_admins_can_send']
