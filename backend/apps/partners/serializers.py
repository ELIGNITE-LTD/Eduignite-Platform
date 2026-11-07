from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import ApplicantKind, Partner, PartnerApplication, PartnerType


# ── Partner types ────────────────────────────────────────────────────────────
class PartnerTypeSerializer(serializers.ModelSerializer):
    application_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PartnerType
        fields = ['id', 'name', 'slug', 'description', 'instructions', 'is_active', 'order', 'application_count']
        read_only_fields = ['id', 'slug', 'application_count']

    def get_application_count(self, obj):
        return getattr(obj, 'application_total', None) if getattr(obj, 'application_total', None) is not None else obj.applications.count()


class PublicPartnerTypeSerializer(serializers.ModelSerializer):
    """What the public application form needs — active types only, no counts."""

    class Meta:
        model = PartnerType
        fields = ['id', 'name', 'slug', 'description', 'instructions']


# ── Applications ─────────────────────────────────────────────────────────────
class PartnerApplicationCreateSerializer(serializers.ModelSerializer):
    partner_type = serializers.PrimaryKeyRelatedField(
        queryset=PartnerType.objects.filter(is_active=True),
    )

    class Meta:
        model = PartnerApplication
        fields = [
            'partner_type', 'applicant_kind',
            'full_name', 'email', 'phone', 'country', 'region_city', 'website',
            'organization_name', 'organization_type', 'contact_person_position',
            'proposed_partnership', 'contribution', 'answers', 'documents',
        ]

    def validate(self, attrs):
        kind = attrs.get('applicant_kind')
        if kind == ApplicantKind.ORGANIZATION and not (attrs.get('organization_name') or '').strip():
            raise serializers.ValidationError({'organization_name': 'Organization name is required.'})
        if not (attrs.get('full_name') or '').strip():
            raise serializers.ValidationError({'full_name': 'A contact name is required.'})
        return attrs

    def create(self, validated_data):
        ptype = validated_data.get('partner_type')
        validated_data['partner_type_name'] = ptype.name if ptype else ''
        return super().create(validated_data)


class PartnerApplicationSerializer(serializers.ModelSerializer):
    """Full application detail for the CEO review view."""

    partner_type_name = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.name', read_only=True)

    class Meta:
        model = PartnerApplication
        fields = [
            'id', 'partner_type', 'partner_type_name', 'applicant_kind',
            'full_name', 'email', 'phone', 'country', 'region_city', 'website',
            'organization_name', 'organization_type', 'contact_person_position',
            'proposed_partnership', 'contribution', 'answers', 'documents',
            'status', 'status_display', 'ceo_message', 'reviewed_by_name',
            'reviewed_at', 'approved_at', 'created_at',
        ]


class ApplicationReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject', 'request_info', 'under_review'])
    message = serializers.CharField(required=False, allow_blank=True, default='')


# ── Account creation / auth ──────────────────────────────────────────────────
class AccountCreateSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        validate_password(attrs['password'])
        return attrs


class PartnerLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        validate_password(attrs['password'])
        return attrs


# ── Partner (CEO + portal + public) ──────────────────────────────────────────
class PartnerCeoSerializer(serializers.ModelSerializer):
    """Everything the CEO sees about a partner (no password/security data)."""

    name = serializers.CharField(source='user.name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    partner_type_name = serializers.CharField(source='partner_type.name', read_only=True)
    referral_code = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Partner
        fields = [
            'id', 'name', 'email', 'display_name', 'applicant_kind', 'partner_type', 'partner_type_name',
            'status', 'status_display', 'is_public', 'public_slug', 'public_name', 'public_description',
            'public_website', 'logo_url', 'referral_code',
            'account_created_at', 'last_login_at', 'last_activity_at', 'created_at',
        ]
        read_only_fields = ['id', 'name', 'email', 'referral_code', 'account_created_at', 'last_login_at', 'last_activity_at', 'created_at']


class PartnerPublicSerializer(serializers.ModelSerializer):
    """Only the fields intentionally designated public. Never exposes email,
    phone, application data, analytics or internal notes."""

    type = serializers.CharField(source='partner_type.name', read_only=True)

    class Meta:
        model = Partner
        fields = ['public_slug', 'public_name', 'public_description', 'public_website', 'logo_url', 'type', 'applicant_kind']


class PartnerPublicProfileUpdateSerializer(serializers.ModelSerializer):
    """What a partner may edit about their own public profile. CEO still
    controls whether it is actually shown (is_public)."""

    class Meta:
        model = Partner
        fields = ['public_name', 'public_description', 'public_website', 'logo_url']
