from rest_framework import serializers
from .models import Order


class OrderListSerializer(serializers.ModelSerializer):
    processed_by_name = serializers.CharField(source='processed_by.get_full_name', read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'full_name', 'school_name', 'email', 'whatsapp_number', 'status',
                  'processed_by_name', 'processed_at', 'created_at']


class OrderDetailSerializer(serializers.ModelSerializer):
    processed_by_name = serializers.CharField(source='processed_by.get_full_name', read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'full_name', 'occupation', 'school_name', 'whatsapp_number', 'email',
                  'region', 'division', 'sub_division', 'message', 'status', 'processed_by',
                  'processed_by_name', 'processed_at', 'notes', 'created_at', 'updated_at']


class OrderCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ['full_name', 'occupation', 'school_name', 'whatsapp_number', 'email',
                  'region', 'division', 'sub_division', 'message']


class OrderProcessSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ['status', 'notes']

    def update(self, instance, validated_data):
        instance.status = validated_data.get('status', instance.status)
        instance.notes = validated_data.get('notes', instance.notes)
        instance.processed_by = self.context['request'].user
        from django.utils import timezone
        instance.processed_at = timezone.now()
        instance.save()
        return instance
