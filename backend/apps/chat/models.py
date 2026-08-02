from django.db import models
from django.utils import timezone
from django.core.validators import FileExtensionValidator
from core.models import TimeStampedModel


class Conversation(TimeStampedModel):
    CONVERSATION_TYPE_CHOICES = [
        ('direct', 'Direct Message'),
        ('group', 'Group Chat'),
        ('official', 'Official Announcement'),
        ('support', 'Support Chat'),
    ]

    participants = models.ManyToManyField(
        'users.User',
        through='ConversationParticipant',
        related_name='conversations'
    )
    conversation_type = models.CharField(
        max_length=20,
        choices=CONVERSATION_TYPE_CHOICES,
        default='direct'
    )
    name = models.CharField(max_length=255, blank=True)
    school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='conversations'
    )
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='chat_conversations',
    )
    subject = models.ForeignKey(
        'grades.Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='chat_conversations',
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_conversations'
    )
    last_message = models.TextField(blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    only_admins_can_send = models.BooleanField(default=False)

    class Meta:
        ordering = ['-last_message_at', '-created_at']
        indexes = [
            models.Index(fields=['school', '-last_message_at']),
            models.Index(fields=['is_active', '-created_at']),
            models.Index(fields=['school_class']),
            models.Index(fields=['subject']),
        ]

    def __str__(self):
        if self.name:
            return self.name
        participant_names = ', '.join(
            self.participants.values_list('name', flat=True)[:3]
        )
        return f"Conversation with {participant_names}"

    def get_unread_count(self, user):
        """Get unread message count for a user."""
        try:
            participant = ConversationParticipant.objects.get(
                conversation=self,
                user=user
            )
            return self.messages.filter(
                created_at__gt=participant.last_read_at or self.created_at,
                is_deleted=False
            ).exclude(sender=user).count()
        except ConversationParticipant.DoesNotExist:
            return 0

    def add_participant(self, user, role='member'):
        """Add a user to the conversation."""
        return ConversationParticipant.objects.get_or_create(
            conversation=self,
            user=user,
            defaults={'role': role}
        )

    @property
    def admin_participant_ids(self):
        return list(
            self.participant_records.filter(role='admin').values_list('user_id', flat=True)
        )


class ConversationParticipant(TimeStampedModel):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('member', 'Member'),
    ]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='participant_records'
    )
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='conversation_participations'
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='member'
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)
    is_muted = models.BooleanField(default=False)

    class Meta:
        unique_together = [['conversation', 'user']]
        ordering = ['joined_at']

    def __str__(self):
        return f"{self.user.get_full_name()} in {self.conversation}"

    def mark_as_read(self):
        """Mark all messages as read up to now."""
        self.last_read_at = timezone.now()
        self.save(update_fields=['last_read_at', 'updated_at'])


class Message(TimeStampedModel):
    MESSAGE_TYPE_CHOICES = [
        ('text', 'Text'),
        ('image', 'Image'),
        ('file', 'File'),
        ('system', 'System'),
    ]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    sender = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_messages'
    )
    text = models.TextField()
    message_type = models.CharField(
        max_length=20,
        choices=MESSAGE_TYPE_CHOICES,
        default='text'
    )
    attachment = models.FileField(
        upload_to='chat_attachments/',
        null=True,
        blank=True,
        validators=[FileExtensionValidator(
            allowed_extensions=['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif']
        )]
    )
    # Storage-free attachment path: the picture/document travels and lives
    # as a base64 data-URL, so no media-storage configuration on the server
    # can break chat uploads.
    attachment_data = models.TextField(blank=True, default='')
    attachment_name = models.CharField(max_length=255, blank=True, default='')
    is_official = models.BooleanField(default=False)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies'
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['is_deleted', 'created_at']),
            models.Index(fields=['sender', 'created_at']),
        ]

    def __str__(self):
        return f"Message from {self.sender} in {self.conversation}"

    def soft_delete(self):
        """Soft delete a message by marking it as deleted."""
        self.is_deleted = True
        self.text = '[Message deleted]'
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'text', 'deleted_at', 'updated_at'])

    def mark_as_read(self):
        """Mark message as read."""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at', 'updated_at'])


class MessageReaction(TimeStampedModel):
    """A single emoji reaction a user placed on a message (WhatsApp-style).

    A user can have at most one reaction per message; re-reacting replaces the
    emoji and reacting with the same emoji again removes it.
    """

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='reactions',
    )
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='message_reactions',
    )
    emoji = models.CharField(max_length=16)

    class Meta:
        unique_together = [['message', 'user']]
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['message']),
        ]

    def __str__(self):
        return f"{self.emoji} by {self.user_id} on {self.message_id}"
