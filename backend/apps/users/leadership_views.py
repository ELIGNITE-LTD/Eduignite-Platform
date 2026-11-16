"""Founders-only API for the leadership history (the Founders tab). ``/api/v1/users/leadership/``."""

from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from .executive_access import FounderOnly
from .models import LeadershipEntry


class LeadershipEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadershipEntry
        fields = ['id', 'person_name', 'title', 'department', 'start_date', 'end_date', 'is_current', 'note',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        current = self.instance
        start = attrs.get('start_date', getattr(current, 'start_date', None))
        end = attrs.get('end_date', getattr(current, 'end_date', None))
        is_current = attrs.get('is_current', getattr(current, 'is_current', True))
        if is_current and end:
            raise serializers.ValidationError({'end_date': 'A current position has no end date.'})
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'The end date cannot be before the start date.'})
        for field in ('person_name', 'title'):
            if field in attrs:
                attrs[field] = ' '.join(str(attrs[field]).split())
                if not attrs[field]:
                    raise serializers.ValidationError({field: 'This field is required.'})
        return attrs


class LeadershipEntryViewSet(viewsets.ModelViewSet):
    """The CEO and CTO read and maintain the record; nobody else can see it through this API."""

    serializer_class = LeadershipEntrySerializer
    permission_classes = [IsAuthenticated, FounderOnly]
    queryset = LeadershipEntry.objects.all()
    pagination_class = None
