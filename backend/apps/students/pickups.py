"""Authorised pick-up: who may collect each child (nursery / maternelle).

Access follows ``school_life.scoped_students`` (isolation by school, sub-school
for vice principals, own class for class teachers, linked child for parents).
Admins and the class teacher read and write; a parent only reads.
"""
import re

from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import AuthorizedPickup
from .school_life import SchoolLifePermission, _student_or_404, _writable_student, can_write, scoped_students

MAX_ACTIVE_PER_CHILD = 10


def normalize_pickup_phone(value):
    """Digits only (a leading + or 00 is accepted); a bare 9-digit Cameroon number gets 237."""
    text = str(value or '').strip()
    if not text:
        return ''
    if re.search(r'[A-Za-z]', text):
        raise serializers.ValidationError('The phone number contains letters.')
    digits = re.sub(r'\D', '', text)
    if digits.startswith('00'):
        digits = digits[2:]
    elif len(digits) == 9 and digits[0] in '62':
        digits = '237' + digits
    if not (9 <= len(digits) <= 15) or len(set(digits)) == 1:
        raise serializers.ValidationError('Enter a valid phone number.')
    return digits


class PickupSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = AuthorizedPickup
        fields = ['id', 'student', 'student_name', 'full_name', 'relationship', 'phone', 'id_note',
                  'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'student', 'student_name', 'is_active', 'created_at', 'updated_at']

    def get_student_name(self, obj):
        return obj.student.display_name

    def validate_full_name(self, value):
        value = ' '.join((value or '').split())
        if not value:
            raise serializers.ValidationError('Full name is required.')
        return value

    def validate_phone(self, value):
        return normalize_pickup_phone(value)


class PickupViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin,
    mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    serializer_class = PickupSerializer
    permission_classes = [permissions.IsAuthenticated, SchoolLifePermission]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        queryset = AuthorizedPickup.objects.select_related('student', 'student__user').filter(
            is_active=True,
            school_id=self.request.user.school_id,
            student__in=scoped_students(self.request.user).values('id'),
        )
        student_id = self.request.query_params.get('student')
        if student_id:
            _student_or_404(self.request, student_id)  # unknown / foreign child -> 404
            queryset = queryset.filter(student_id=student_id)
        return queryset

    def create(self, request, *args, **kwargs):
        student = _writable_student(request, request.data.get('student'))
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if AuthorizedPickup.objects.filter(student=student, is_active=True).count() >= MAX_ACTIVE_PER_CHILD:
            raise serializers.ValidationError(
                {'detail': f'A child can have at most {MAX_ACTIVE_PER_CHILD} authorised people.'}
            )
        pickup = serializer.save(student=student, school=student.school, created_by=request.user)
        return Response(self.get_serializer(pickup).data, status=status.HTTP_201_CREATED)

    def _require_write(self):
        if not can_write(self.request.user):
            raise PermissionDenied('Only school staff can change authorised pick-ups.')

    def perform_update(self, serializer):
        self._require_write()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_write()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
