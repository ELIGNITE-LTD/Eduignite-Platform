from rest_framework import serializers

from .models import QRChallenge


class QRChallengeSerializer(serializers.Serializer):
    """Validates the exact QR challenge JSON from the wire contract.

    ``{ challengeId, schoolId, deviceId, purpose, nonce, createdAt, expiresAt,
    previousDeviceId? }`` — this is the raw payload the desktop app renders
    into a QR code and the companion app scans and POSTs verbatim.
    """

    challengeId = serializers.CharField(max_length=64)
    schoolId = serializers.CharField(max_length=50)
    deviceId = serializers.CharField(max_length=32)
    purpose = serializers.ChoiceField(choices=[c[0] for c in QRChallenge.Purpose.choices])
    nonce = serializers.CharField(max_length=64)
    createdAt = serializers.DateTimeField()
    expiresAt = serializers.DateTimeField()
    previousDeviceId = serializers.CharField(max_length=32, required=False, allow_blank=True, default='')


class DeviceReplacementChallengeSerializer(QRChallengeSerializer):
    """Same shape, but ``previousDeviceId`` is mandatory for this flow."""

    previousDeviceId = serializers.CharField(max_length=32, allow_blank=False)

    def validate_purpose(self, value):
        if value != QRChallenge.Purpose.DEVICE_REPLACEMENT:
            raise serializers.ValidationError('purpose must be "device_replacement" for this endpoint.')
        return value


class SyncSessionCreateSerializer(serializers.Serializer):
    deviceId = serializers.CharField(max_length=32)


class SyncRowSerializer(serializers.Serializer):
    table = serializers.CharField(max_length=100)
    rowId = serializers.CharField(max_length=255)
    op = serializers.CharField(max_length=20)
    payload = serializers.DictField(required=False)
    createdAt = serializers.CharField(required=False, allow_blank=True)


class SyncChunkSerializer(serializers.Serializer):
    chunkIndex = serializers.IntegerField(min_value=0)
    totalChunks = serializers.IntegerField(min_value=1)
    checksum = serializers.CharField(max_length=64)
    rows = SyncRowSerializer(many=True)

    def validate(self, attrs):
        if attrs['chunkIndex'] >= attrs['totalChunks']:
            raise serializers.ValidationError('chunkIndex must be less than totalChunks.')
        return attrs


class MigrationImportSerializer(serializers.Serializer):
    """Loose envelope validation; ``migration.transform`` does the real field mapping.

    Kept intentionally permissive (``DictField``/``ListField`` of dicts)
    because the shape of each row is validated by the transform layer, which
    is unit-tested directly against dicts and does not need to duplicate its
    rules in a serializer.
    """

    schoolId = serializers.CharField(max_length=50)
    school = serializers.DictField(required=False, default=dict)
    teachers = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    students = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    confirm = serializers.BooleanField(required=False, default=False)
