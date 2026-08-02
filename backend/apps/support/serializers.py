from rest_framework import serializers
from .models import SupportContribution


class SupportContributionSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True)

    class Meta:
        model = SupportContribution
        fields = ['id', 'user', 'user_name', 'school', 'amount', 'currency', 'payment_method',
                  'phone', 'message', 'status', 'verified_by', 'verified_by_name', 'verified_at',
                  'transaction_reference', 'created_at']


class SupportContributionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportContribution
        fields = ['amount', 'currency', 'payment_method', 'phone', 'message', 'transaction_reference']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        if self.context['request'].user.school:
            validated_data['school'] = self.context['request'].user.school
        return super().create(validated_data)


class SupportVerifySerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportContribution
        fields = ['status', 'transaction_reference']

    def update(self, instance, validated_data):
        instance.status = validated_data.get('status', instance.status)
        instance.transaction_reference = validated_data.get('transaction_reference', instance.transaction_reference)
        instance.verified_by = self.context['request'].user
        from django.utils import timezone
        instance.verified_at = timezone.now()
        instance.save()
        return instance
