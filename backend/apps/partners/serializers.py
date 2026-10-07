from rest_framework import serializers

from .models import InvestmentInterest, PartnerProfile


class PartnerRegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
    organization = serializers.CharField(max_length=180, required=False, allow_blank=True, default='')
    country = serializers.CharField(max_length=80, required=False, allow_blank=True, default='Cameroon')


class PartnerLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class PartnerProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    matricule = serializers.CharField(source='user.matricule', read_only=True)

    class Meta:
        model = PartnerProfile
        fields = ['id', 'name', 'email', 'matricule', 'organization', 'phone', 'country', 'payout_momo_number']
        read_only_fields = ['id', 'name', 'email', 'matricule']


class InvestmentInterestSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestmentInterest
        fields = ['id', 'amount', 'currency', 'message', 'status', 'created_at']
        read_only_fields = ['id', 'status', 'created_at', 'currency']

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Enter an amount greater than zero.')
        return value
