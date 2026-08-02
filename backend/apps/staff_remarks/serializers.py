from rest_framework import serializers
from .models import StaffRemark


class StaffRemarkSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.get_full_name', read_only=True)
    admin_name = serializers.CharField(source='admin.get_full_name', read_only=True)
    remark_type_display = serializers.CharField(source='get_remark_type_display', read_only=True)

    class Meta:
        model = StaffRemark
        fields = ['id', 'staff', 'staff_name', 'admin', 'admin_name', 'text', 'remark_type',
                  'remark_type_display', 'is_confidential', 'acknowledged', 'acknowledged_at',
                  'created_at']


class StaffRemarkCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffRemark
        fields = ['staff', 'text', 'remark_type', 'is_confidential']

    def create(self, validated_data):
        validated_data['admin'] = self.context['request'].user
        validated_data['school'] = self.context['request'].user.school
        return super().create(validated_data)
