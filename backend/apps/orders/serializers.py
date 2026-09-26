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
    referred_by_name = serializers.CharField(source='referred_by.name', read_only=True, default=None)

    class Meta:
        model = Order
        fields = ['id', 'full_name', 'occupation', 'school_name', 'whatsapp_number', 'email',
                  'region', 'division', 'sub_division', 'message', 'status', 'processed_by',
                  'processed_by_name', 'processed_at', 'notes', 'created_at', 'updated_at',
                  'referral_code', 'referred_by_name']


class OrderCreateSerializer(serializers.ModelSerializer):
    """The public request form, which may carry the code of whoever sent them."""

    referral_code = serializers.CharField(
        max_length=12, required=False, allow_blank=True, write_only=True
    )

    class Meta:
        model = Order
        fields = ['full_name', 'occupation', 'school_name', 'whatsapp_number', 'email',
                  'region', 'division', 'sub_division', 'message', 'referral_code']

    def create(self, validated_data):
        from apps.users.referrals import resolve_referrer

        code = (validated_data.pop('referral_code', '') or '').strip().upper()
        order = Order(**validated_data)
        order.referral_code = code
        # A code that matches nobody is still worth keeping: the link may be
        # mistyped or belong to an account since removed, and the school in
        # front of us still wants EduIgnite.
        order.referred_by = resolve_referrer(code)
        order.save()
        return order


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
