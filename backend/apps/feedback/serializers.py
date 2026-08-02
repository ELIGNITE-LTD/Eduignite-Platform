from rest_framework import serializers
from .models import Feedback, FeedbackResponse


class FeedbackResponseSerializer(serializers.ModelSerializer):
    responder_name = serializers.CharField(source='responder.get_full_name', read_only=True)

    class Meta:
        model = FeedbackResponse
        fields = ['id', 'responder', 'responder_name', 'message', 'created_at']


class FeedbackListSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.get_full_name', read_only=True)
    sender_role = serializers.CharField(source='sender.role', read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    message = serializers.CharField(read_only=True)

    class Meta:
        model = Feedback
        fields = ['id', 'subject', 'message', 'sender_name', 'sender_role', 'sender_avatar',
                  'category', 'status', 'priority', 'created_at']

    def get_sender_avatar(self, obj):
        return obj.sender.avatar or None


class FeedbackDetailSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.get_full_name', read_only=True)
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True)
    responses = FeedbackResponseSerializer(many=True, read_only=True)

    class Meta:
        model = Feedback
        fields = ['id', 'subject', 'message', 'category', 'sender', 'sender_name', 'status', 'priority',
                  'resolved_by', 'resolved_by_name', 'resolved_at', 'resolution_note',
                  'attachment', 'created_at', 'responses']


class FeedbackCreateSerializer(serializers.ModelSerializer):
    submitted_at = serializers.DateTimeField(source='created_at', read_only=True)
    priority = serializers.CharField(required=False, allow_blank=True, default='Medium')

    class Meta:
        model = Feedback
        fields = ['id', 'subject', 'message', 'category', 'priority', 'attachment', 'submitted_at']
        read_only_fields = ['id', 'submitted_at']

    def validate_priority(self, value):
        normalized = {
            'low': 'Low',
            'medium': 'Medium',
            'high': 'High',
            'critical': 'Critical',
        }.get(str(value).lower(), value)
        valid_values = {choice[0] for choice in Feedback.PRIORITY_CHOICES}
        if normalized not in valid_values:
            raise serializers.ValidationError('Choose low, medium, high, or critical.')
        return normalized

    def validate_category(self, value):
        normalized = (value or 'general').strip().lower()
        if not normalized:
            return 'general'
        if len(normalized) > 80:
            raise serializers.ValidationError('Category must be 80 characters or fewer.')
        return normalized

    def validate(self, attrs):
        user = self.context['request'].user
        if not getattr(user, 'school_id', None):
            raise serializers.ValidationError({'school': 'Your account is not linked to a school.'})
        return attrs

    def create(self, validated_data):
        validated_data['sender'] = self.context['request'].user
        validated_data['school'] = self.context['request'].user.school
        return super().create(validated_data)


class FeedbackResolveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = ['status', 'resolution_note']

    def validate(self, data):
        if data.get('status') == 'Resolved' and not data.get('resolution_note'):
            raise serializers.ValidationError("resolution_note is required when resolving feedback")
        return data

    def update(self, instance, validated_data):
        instance.status = validated_data.get('status', instance.status)
        instance.resolution_note = validated_data.get('resolution_note', instance.resolution_note)
        instance.resolved_by = self.context['request'].user
        from django.utils import timezone
        instance.resolved_at = timezone.now()
        instance.save()
        return instance
