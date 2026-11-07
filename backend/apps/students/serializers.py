from datetime import date
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
import logging
import uuid as _uuid

from apps.schools.relations import resolve_school_class
from .models import Guardian, Student, StudentGuardian, StudentPromotionRecord, ParentStudentLink, StudentActivationToken
from .parent_accounts import get_or_create_parent_account, sync_parent_student_relationship
from apps.users.serializers import UserListSerializer as UserBasicSerializer
from apps.users.matricules import generate_school_user_matricule

User = get_user_model()
logger = logging.getLogger(__name__)


class ParentStudentLinkSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.get_full_name', read_only=True)
    student_name = serializers.CharField(source='student.display_name', read_only=True)
    created_at = serializers.DateTimeField(source='created', read_only=True)

    class Meta:
        model = ParentStudentLink
        fields = [
            'id',
            'parent',
            'parent_name',
            'student',
            'student_name',
            'relationship',
            'is_primary',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class GuardianSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    students_count = serializers.SerializerMethodField()

    class Meta:
        model = Guardian
        fields = [
            'id',
            'user',
            'user_id',
            'name',
            'phone',
            'whatsapp',
            'email',
            'national_id',
            'occupation',
            'students_count',
            'created',
            'modified',
        ]
        read_only_fields = ['id', 'created', 'modified', 'students_count']

    def get_students_count(self, obj):
        return getattr(obj, 'students_count', obj.student_links.count())


class StudentGuardianSerializer(serializers.ModelSerializer):
    guardian = GuardianSerializer(read_only=True)
    guardian_id = serializers.UUIDField(source='guardian.id', read_only=True)
    student_name = serializers.CharField(source='student.display_name', read_only=True)

    class Meta:
        model = StudentGuardian
        fields = [
            'id',
            'student',
            'student_name',
            'guardian',
            'guardian_id',
            'relationship',
            'is_primary',
            'can_pickup',
            'emergency_contact',
            'created',
            'modified',
        ]
        read_only_fields = ['id', 'student', 'guardian', 'guardian_id', 'created', 'modified']


def _student_has_graduated(student) -> bool:
    """
    True once the learner's most recent committed decision was a graduation.

    Read from the promotion records rather than stored on the learner, so it
    stays correct if a decision is later revised.
    """
    from .models import StudentPromotionRecord

    latest = (
        StudentPromotionRecord.objects.filter(student=student)
        .exclude(decided_by__isnull=True)
        .order_by('-decided_at', '-created')
        .values_list('status', flat=True)
        .first()
    )
    return latest == StudentPromotionRecord.Status.GRADUATED


class StudentListSerializer(serializers.ModelSerializer):
    user = UserBasicSerializer(read_only=True)
    full_name = serializers.CharField(source='display_name', read_only=True)
    display_matricule = serializers.CharField(read_only=True)
    display_avatar = serializers.CharField(read_only=True)
    parent_count = serializers.SerializerMethodField()
    parent_links = ParentStudentLinkSerializer(many=True, read_only=True)
    guardian_links = StudentGuardianSerializer(many=True, read_only=True)
    guardians_count = serializers.SerializerMethodField()
    school_class_id = serializers.UUIDField(read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    sub_school_name = serializers.CharField(source='school_class.sub_school.name', read_only=True)
    # A learner who finished the final class has no next class to sit in, so
    # their account has to say so rather than keep showing the class they left.
    is_graduated = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id',
            'user',
            'full_name',
            'display_matricule',
            'display_avatar',
            'school',
            'admission_number',
            'school_class_id',
            'school_class_name',
            'sub_school_name',
            'is_graduated',
            'student_class',
            'class_level',
            'section',
            'date_of_birth',
            'place_of_birth',
            'gender',
            'guardian_name',
            'guardian_phone',
            'guardian_whatsapp',
            'admission_date',
            'qr_code',
            'annual_average',
            'is_on_honour_roll',
            'parent_count',
            'parent_links',
            'guardians_count',
            'guardian_links',
        ]
        read_only_fields = ['id', 'qr_code', 'annual_average', 'is_on_honour_roll']

    def get_is_graduated(self, obj):
        return _student_has_graduated(obj)

    def get_parent_count(self, obj):
        return obj.parent_links.count()

    def get_guardians_count(self, obj):
        return obj.guardian_links.count()


class StudentDetailSerializer(serializers.ModelSerializer):
    user = UserBasicSerializer(read_only=True)
    parent_links = ParentStudentLinkSerializer(many=True, read_only=True)
    guardian_links = StudentGuardianSerializer(many=True, read_only=True)
    age = serializers.SerializerMethodField()
    school_class_id = serializers.UUIDField(read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    sub_school_name = serializers.CharField(source='school_class.sub_school.name', read_only=True)
    # A learner who finished the final class has no next class to sit in, so
    # their account has to say so rather than keep showing the class they left.
    is_graduated = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id',
            'user',
            'school',
            'school_class_id',
            'school_class_name',
            'sub_school_name',
            'is_graduated',
            'student_class',
            'class_level',
            'section',
            'date_of_birth',
            'place_of_birth',
            'age',
            'gender',
            'guardian_name',
            'guardian_phone',
            'guardian_whatsapp',
            'admission_number',
            'admission_date',
            'annual_average',
            'is_on_honour_roll',
            'qr_code',
            'parent_links',
            'guardian_links',
            'created',
            'modified',
        ]
        read_only_fields = ['id', 'created', 'modified', 'qr_code', 'annual_average', 'is_on_honour_roll']

    def get_is_graduated(self, obj):
        return _student_has_graduated(obj)

    def get_age(self, obj):
        from datetime import date

        if obj.date_of_birth:
            today = date.today()
            return today.year - obj.date_of_birth.year - (
                (today.month, today.day) < (obj.date_of_birth.month, obj.date_of_birth.day)
            )
        return None


class StudentCreateSerializer(serializers.ModelSerializer):
    OPTIONAL_BLANK_FIELDS = {
        'email',
        'phone',
        'whatsapp',
        'password',
        'school_class',
        'date_of_birth',
        'place_of_birth',
        'guardian_name',
        'guardian_phone',
        'guardian_whatsapp',
        'admission_number',
        'admission_date',
        'parent_name',
        'parent_email',
        'parent_phone',
        'parent_whatsapp',
    }

    school = serializers.PrimaryKeyRelatedField(read_only=True)
    school_class = serializers.PrimaryKeyRelatedField(
        queryset=Student._meta.get_field('school_class').remote_field.model.objects.none(),
        required=False,
        allow_null=True,
    )
    email = serializers.EmailField(required=False, allow_blank=True)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    whatsapp = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8, required=False, allow_blank=True)
    class_level = serializers.CharField(max_length=100, required=False, allow_blank=True, default='Form 1')
    section = serializers.CharField(max_length=100, required=False, allow_blank=True, default='General')
    gender = serializers.ChoiceField(choices=Student.GENDER_CHOICES, required=False, default='other')
    guardian_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    guardian_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    guardian_whatsapp = serializers.CharField(max_length=20, required=False, allow_blank=True)
    admission_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    admission_date = serializers.DateField(required=False)
    parent_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    parent_email = serializers.EmailField(required=False, allow_blank=True)
    parent_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    parent_whatsapp = serializers.CharField(max_length=20, required=False, allow_blank=True)
    parent_relationship = serializers.ChoiceField(
        choices=ParentStudentLink.RELATIONSHIP_CHOICES,
        required=False,
        default='guardian',
    )
    create_parent_account = serializers.BooleanField(required=False, default=False)
    # False enrols a learner who has no login account (e.g. a nursery pupil).
    create_login = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Student
        fields = [
            'email',
            'name',
            'first_name',
            'last_name',
            'phone',
            'whatsapp',
            'password',
            'school',
            'school_class',
            'student_class',
            'class_level',
            'section',
            'date_of_birth',
            'place_of_birth',
            'gender',
            'guardian_name',
            'guardian_phone',
            'guardian_whatsapp',
            'admission_number',
            'admission_date',
            'parent_name',
            'parent_email',
            'parent_phone',
            'parent_whatsapp',
            'parent_relationship',
            'create_parent_account',
            'create_login',
        ]

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        else:
            data = dict(data)
        for field in self.OPTIONAL_BLANK_FIELDS:
            if data.get(field) == '':
                data.pop(field, None)
        return super().to_internal_value(data)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        requester = getattr(request, 'user', None)
        school = getattr(requester, 'school', None)
        if school:
            self.fields['school_class'].queryset = self.fields['school_class'].queryset.model.objects.filter(school=school).order_by('name')

    def validate_admission_number(self, value):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if value and school and Student.objects.filter(school=school, admission_number=value).exists():
            raise serializers.ValidationError("A student with this admission number already exists in this school.")
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        requester = getattr(request, 'user', None)

        if requester and requester.is_authenticated and requester.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            if not requester.school:
                raise serializers.ValidationError({'school': 'Your account is not linked to a school.'})
            attrs['school'] = requester.school

        full_name = attrs.get('name') or " ".join(
            part for part in [attrs.get('first_name', '').strip(), attrs.get('last_name', '').strip()] if part
        ).strip()
        if not full_name:
            raise serializers.ValidationError({'name': 'Provide the student full name.'})
        attrs['name'] = full_name
        school_class = resolve_school_class(
            attrs.get('school'),
            school_class=attrs.get('school_class'),
            class_name=attrs.get('student_class'),
        )
        if school_class:
            attrs['school_class'] = school_class
            attrs['student_class'] = school_class.name
        elif not (attrs.get('student_class') or '').strip():
            raise serializers.ValidationError({'student_class': 'Provide a class name or select a registered class.'})
        attrs['class_level'] = (attrs.get('class_level') or self._infer_class_level(attrs.get('student_class', ''))).strip()
        attrs['section'] = (attrs.get('section') or self._infer_section(attrs.get('student_class', ''))).strip()

        if attrs.get('create_parent_account'):
            attrs['parent_name'] = attrs.get('parent_name', '').strip() or attrs.get('guardian_name', '').strip()
            attrs['parent_phone'] = attrs.get('parent_phone', '').strip() or attrs.get('guardian_phone', '').strip()
            attrs['parent_whatsapp'] = attrs.get('parent_whatsapp', '').strip() or attrs.get('guardian_whatsapp', '').strip()
            if not attrs.get('parent_name', '').strip():
                raise serializers.ValidationError({
                    'parent_name': 'Parent name is required when creating a parent account.',
                })

        return attrs

    def _infer_class_level(self, student_class):
        label = (student_class or '').strip().lower()
        if 'upper sixth' in label or 'upper 6' in label or 'uppersixth' in label:
            return 'Upper Sixth'
        if 'lower sixth' in label or 'lower 6' in label or 'lowersixth' in label:
            return 'Lower Sixth'
        normalized = label.replace(' ', '')
        for level in ['form1', 'form2', 'form3', 'form4', 'form5']:
            if level in normalized:
                return level.replace('form', 'Form ')
        if 'form 1' in label:
            return 'Form 1'
        if 'form 2' in label:
            return 'Form 2'
        if 'form 3' in label:
            return 'Form 3'
        if 'form 4' in label:
            return 'Form 4'
        if 'form 5' in label:
            return 'Form 5'
        return 'Form 1'

    def _infer_section(self, student_class):
        label = (student_class or '').strip().lower()
        if 'bilingual' in label:
            return 'Bilingual'
        if 'technical' in label:
            return 'Technical'
        if 'science' in label:
            return 'Science'
        if 'arts' in label or 'art' in label:
            return 'Arts'
        if 'commercial' in label or 'commerce' in label:
            return 'Commercial'
        if 'french' in label or 'francophone' in label:
            return 'French Section'
        if 'english' in label or 'anglophone' in label:
            return 'English Section'
        return 'General'

    def _generate_matricule(self, school):
        return generate_school_user_matricule(school, 'STUDENT')

    def _generate_placeholder_email(self, matricule):
        email = f"{matricule.lower()}@students.eduignite.local"
        while User.objects.filter(email=email).exists():
            email = f"{matricule.lower()}.{_uuid.uuid4().hex[:4]}@students.eduignite.local"
        return email

    def _generate_admission_number(self, school):
        existing_numbers = Student.objects.filter(school=school).values_list('admission_number', flat=True)
        numeric_values = [
            int(value)
            for value in existing_numbers
            if str(value or '').isdigit()
        ]
        counter = max(numeric_values, default=0) + 1
        while True:
            admission_number = f"{counter:04d}"
            if not Student.objects.filter(school=school, admission_number=admission_number).exists():
                return admission_number
            counter += 1

    @transaction.atomic
    def create(self, validated_data):
        email = (validated_data.pop('email', '') or '').strip()
        name = validated_data.pop('name')
        validated_data.pop('first_name', None)
        validated_data.pop('last_name', None)
        phone = validated_data.pop('phone', '')
        whatsapp = validated_data.pop('whatsapp', '')
        password = validated_data.pop('password', '')
        parent_name = validated_data.pop('parent_name', '').strip()
        parent_email = validated_data.pop('parent_email', '').strip()
        parent_phone = validated_data.pop('parent_phone', '').strip()
        parent_whatsapp = validated_data.pop('parent_whatsapp', '').strip()
        parent_relationship = validated_data.pop('parent_relationship', 'guardian')
        create_parent_account = validated_data.pop('create_parent_account', False)
        create_login = validated_data.pop('create_login', True)
        school = validated_data['school']
        matricule = self._generate_matricule(school)

        if create_login and not email:
            email = self._generate_placeholder_email(matricule)

        if not validated_data.get('admission_number'):
            validated_data['admission_number'] = self._generate_admission_number(school)
        if not validated_data.get('admission_date'):
            validated_data['admission_date'] = date.today()
        validated_data['guardian_name'] = validated_data.get('guardian_name', '').strip()
        validated_data['guardian_phone'] = validated_data.get('guardian_phone', '').strip()
        validated_data['guardian_whatsapp'] = validated_data.get('guardian_whatsapp', '').strip()
        validated_data['gender'] = validated_data.get('gender') or 'other'

        if create_login:
            user = User.objects.create_user(
                matricule=matricule,
                name=name,
                email=email,
                role='STUDENT',
                phone=phone or None,
                whatsapp=whatsapp or None,
                school=school,
                password=password or '!pending_activation',
            )
            student = Student.objects.create(user=user, **validated_data)
        else:
            # No account: the learner's name and matricule live on the record.
            # The matricule still comes from the one generator, which counts
            # these records, so it can never be issued twice.
            student = Student.objects.create(
                user=None, name=name, matricule=matricule, **validated_data
            )
        guardian_name = validated_data.get('guardian_name', '').strip()
        guardian_phone = validated_data.get('guardian_phone', '').strip()
        if guardian_name or guardian_phone:
            relationship = parent_relationship if parent_relationship in dict(Guardian.RELATIONSHIP_CHOICES) else 'legal_guardian'
            guardian_defaults = {
                'name': guardian_name or parent_name or f'{name} Guardian',
                'whatsapp': validated_data.get('guardian_whatsapp', '') or parent_whatsapp,
                'email': parent_email,
            }
            if guardian_phone:
                guardian, _ = Guardian.objects.get_or_create(phone=guardian_phone, defaults=guardian_defaults)
            else:
                guardian = Guardian.objects.create(phone='', **guardian_defaults)
            StudentGuardian.objects.update_or_create(
                student=student,
                guardian=guardian,
                defaults={
                    'relationship': relationship,
                    'is_primary': True,
                    'can_pickup': True,
                    'emergency_contact': True,
                },
            )
        try:
            student.generate_qr_code()
        except Exception:
            logger.exception("Student QR generation failed for student %s", student.pk)

        if create_parent_account:
            parent, _ = get_or_create_parent_account(
                school=student.school,
                name=parent_name or validated_data.get('guardian_name', ''),
                email=parent_email,
                phone=parent_phone or validated_data.get('guardian_phone', ''),
                whatsapp=parent_whatsapp or validated_data.get('guardian_whatsapp', ''),
            )

            sync_parent_student_relationship(
                student=student,
                parent=parent,
                relationship=parent_relationship,
                is_primary=True,
                can_pickup=True,
                emergency_contact=True,
            )
            student._parent_matricule = getattr(parent, 'matricule', None)

        return student


class StudentUpdateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name', required=False)
    email = serializers.EmailField(source='user.email', required=False)
    phone = serializers.CharField(source='user.phone', required=False, allow_blank=True)
    whatsapp = serializers.CharField(source='user.whatsapp', required=False, allow_blank=True)
    school_class = serializers.PrimaryKeyRelatedField(
        queryset=Student._meta.get_field('school_class').remote_field.model.objects.none(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Student
        fields = [
            'name',
            'email',
            'phone',
            'whatsapp',
            'school_class',
            'student_class',
            'class_level',
            'section',
            'date_of_birth',
            'place_of_birth',
            'gender',
            'guardian_name',
            'guardian_phone',
            'guardian_whatsapp',
        ]

    def to_internal_value(self, data):
        # The edit form prefills date_of_birth as '' for a learner who has none.
        # An empty string is not a valid date, so coerce it to null (the field
        # is optional and nullable) instead of failing the whole save with
        # "Date has wrong format".
        if hasattr(data, 'get') and 'date_of_birth' in data and str(data.get('date_of_birth') or '').strip() == '':
            data = data.copy()
            data['date_of_birth'] = None
        return super().to_internal_value(data)

    def validate_school_class(self, value):
        if value and self.instance and value.school_id != self.instance.school_id:
            raise serializers.ValidationError('Selected class must belong to this school.')
        return value

    def validate(self, attrs):
        school_class = resolve_school_class(
            self.instance.school,
            school_class=attrs.get('school_class'),
            class_name=attrs.get('student_class'),
        )
        if school_class:
            attrs['school_class'] = school_class
            attrs['student_class'] = school_class.name
        return attrs

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        school_class = validated_data.get('school_class')
        if school_class:
            validated_data['student_class'] = school_class.name
        student = super().update(instance, validated_data)

        if user_data and student.user_id:
            for field, value in user_data.items():
                setattr(student.user, field, value)
            student.user.save(update_fields=list(user_data.keys()))
        elif user_data and 'name' in user_data:
            # No login account: the name is held on the learner itself.
            student.name = user_data['name']
            student.save(update_fields=['name'])

        return student

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = kwargs.get('instance') or getattr(self, 'instance', None)
        school = getattr(instance, 'school', None)
        if school:
            self.fields['school_class'].queryset = self.fields['school_class'].queryset.model.objects.filter(school=school).order_by('name')


class HonourRollSerializer(serializers.ModelSerializer):
    user = UserBasicSerializer(read_only=True)
    rank = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id',
            'user',
            'admission_number',
            'student_class',
            'annual_average',
            'rank',
        ]
        read_only_fields = ['id', 'annual_average']

    def get_rank(self, obj):
        count = Student.objects.filter(
            school=obj.school,
            class_level=obj.class_level,
            annual_average__gt=obj.annual_average
        ).count()
        return count + 1


class StudentActivationTokenSerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    sub_school_id = serializers.UUIDField(source='school_class.sub_school_id', read_only=True)
    sub_school_name = serializers.CharField(source='school_class.sub_school.name', read_only=True)

    class Meta:
        model = StudentActivationToken
        fields = [
            'id',
            'matricule',
            'student_name',
            'school_class',
            'school_class_name',
            'sub_school_id',
            'sub_school_name',
            'student_class',
            'class_level',
            'section',
            'department',
            'stream',
            'batch_name',
            'is_used',
            'used_at',
            'created',
            'modified',
        ]
        read_only_fields = ['id', 'matricule', 'is_used', 'used_at', 'created', 'modified']


class StudentPromotionRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.display_name', read_only=True)
    student_matricule = serializers.CharField(source='student.display_matricule', read_only=True)
    admission_number = serializers.CharField(source='student.admission_number', read_only=True)
    current_class_name = serializers.CharField(read_only=True)
    promoted_to_class_name = serializers.CharField(read_only=True)
    decided_by_name = serializers.CharField(source='decided_by.get_full_name', read_only=True)
    sub_school_name = serializers.CharField(source='current_class.sub_school.name', read_only=True)
    # Distinguishes a decision that has actually moved the learner from one the
    # screen merely proposes.
    is_applied = serializers.BooleanField(read_only=True)

    class Meta:
        model = StudentPromotionRecord
        fields = [
            'id',
            'student',
            'student_name',
            'student_matricule',
            'admission_number',
            'school',
            'academic_year',
            'current_class',
            'current_class_name',
            'sub_school_name',
            'promoted_to_class',
            'promoted_to_class_name',
            'average_score',
            'promotion_average',
            'status',
            'decision_reason',
            'decided_by',
            'decided_by_name',
            'decided_at',
            'is_applied',
            'created',
            'modified',
        ]
        read_only_fields = fields
