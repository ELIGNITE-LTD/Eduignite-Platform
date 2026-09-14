import base64

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers
from decimal import Decimal
from .models import (
    Subject,
    Sequence,
    Grade,
    TermResult,
    AnnualResult,
    SubjectMaterial,
    StudentSubjectEnrollment,
    ClassSubject,
    ReportCardPublication,
)
from .sequence_defaults import TERM_NUMBER_BY_SETTING
from apps.students import api as students_api
from apps.students.serializers import StudentListSerializer

User = get_user_model()
TEACHING_STAFF_ROLES = ['TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN']


def _active_term_numbers_for_school(school):
    active_terms = set(Sequence.objects.filter(school=school, is_active=True).values_list('term', flat=True))
    if active_terms:
        return active_terms
    try:
        settings = school.settings
    except (AttributeError, ObjectDoesNotExist):
        settings = None
    value = str(getattr(settings, 'term', '') or '').strip().lower()
    if value in TERM_NUMBER_BY_SETTING:
        return {TERM_NUMBER_BY_SETTING[value]}
    return set()


def validate_teacher_active_term(user, sequence):
    if not user or user.role != 'TEACHER' or not sequence:
        return
    active_terms = _active_term_numbers_for_school(sequence.school)
    if active_terms and sequence.term not in active_terms:
        raise serializers.ValidationError({
            'sequence': 'Teachers can only enter or edit marks in the active academic term. Previous and future terms are view-only.'
        })


class SubjectSerializer(serializers.ModelSerializer):
    teacher = serializers.PrimaryKeyRelatedField(queryset=User.objects.none(), required=False, allow_null=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)

    class Meta:
        model = Subject
        fields = ['id', 'school', 'name', 'code', 'level', 'coefficient', 'teacher', 'teacher_name', 'is_active']
        read_only_fields = ['id', 'school']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        school = getattr(user, 'school', None)
        if school:
            self.fields['teacher'].queryset = User.objects.filter(
                school=school,
                role__in=TEACHING_STAFF_ROLES,
            ).order_by('name')

    def validate_teacher(self, value):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        school = getattr(user, 'school', None)
        if value and school and value.school_id != school.id:
            raise serializers.ValidationError('Teacher must belong to your school.')
        if value and value.role not in TEACHING_STAFF_ROLES:
            raise serializers.ValidationError('Teacher must be selected from academic staff.')
        return value


class StudentSubjectEnrollmentSerializer(serializers.ModelSerializer):
    subject = serializers.UUIDField(source='class_subject.subject_id', read_only=True)
    subject_name = serializers.CharField(source='class_subject.subject.name', read_only=True)
    subject_code = serializers.CharField(source='class_subject.subject.code', read_only=True)
    coefficient = serializers.DecimalField(source='class_subject.subject.coefficient', max_digits=5, decimal_places=2, read_only=True)
    teacher = serializers.UUIDField(source='class_subject.teacher_id', read_only=True)
    teacher_name = serializers.CharField(source='class_subject.teacher.name', read_only=True)
    school_class = serializers.UUIDField(source='class_subject.school_class_id', read_only=True)
    class_name = serializers.CharField(source='class_subject.school_class.name', read_only=True)
    type = serializers.CharField(source='class_subject.type', read_only=True)
    can_remove = serializers.SerializerMethodField()

    class Meta:
        model = StudentSubjectEnrollment
        fields = [
            'id',
            'student',
            'class_subject',
            'school_class',
            'class_name',
            'subject',
            'subject_name',
            'subject_code',
            'coefficient',
            'teacher',
            'teacher_name',
            'type',
            'is_active',
            'can_remove',
            'created',
            'modified',
        ]
        read_only_fields = [
            'id',
            'student',
            'class_subject',
            'school_class',
            'class_name',
            'subject',
            'subject_name',
            'subject_code',
            'coefficient',
            'teacher',
            'teacher_name',
            'type',
            'can_remove',
            'created',
            'modified',
        ]

    def get_can_remove(self, obj):
        return obj.class_subject.type == obj.class_subject.SubjectType.OPTIONAL

    def validate_is_active(self, value):
        class_subject = getattr(self.instance, 'class_subject', None)
        if class_subject and class_subject.type == class_subject.SubjectType.MANDATORY and not value:
            raise serializers.ValidationError('Mandatory subjects cannot be removed from a student.')
        return value


class SubjectMaterialSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    source_url = serializers.SerializerMethodField()
    size_label = serializers.SerializerMethodField()
    upload = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = SubjectMaterial
        fields = [
            'id',
            'school',
            'subject',
            'subject_name',
            'subject_code',
            'title',
            'description',
            'material_type',
            'external_url',
            'file_name',
            'mime_type',
            'file_size_bytes',
            'file_data',
            'source_url',
            'size_label',
            'uploaded_by',
            'uploaded_by_name',
            'created',
            'modified',
            'upload',
        ]
        read_only_fields = [
            'id',
            'school',
            'subject_name',
            'subject_code',
            'file_name',
            'mime_type',
            'file_size_bytes',
            'file_data',
            'source_url',
            'size_label',
            'uploaded_by',
            'uploaded_by_name',
            'created',
            'modified',
        ]
        extra_kwargs = {
            'external_url': {'required': False, 'allow_blank': True},
        }

    def get_source_url(self, obj):
        return obj.external_url or obj.file_data

    def get_size_label(self, obj):
        if not obj.file_size_bytes:
            return 'Link' if obj.external_url else 'Unknown'
        size_mb = obj.file_size_bytes / (1024 * 1024)
        if size_mb >= 1:
            return f'{size_mb:.1f} MB'
        size_kb = obj.file_size_bytes / 1024
        return f'{size_kb:.1f} KB'

    def validate(self, attrs):
        upload = attrs.get('upload')
        external_url = (attrs.get('external_url') or '').strip()
        material_type = attrs.get('material_type') or getattr(self.instance, 'material_type', SubjectMaterial.MaterialType.PDF)
        subject = attrs.get('subject') or getattr(self.instance, 'subject', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if subject and user and getattr(user, 'school_id', None) and subject.school_id != user.school_id:
            raise serializers.ValidationError({'subject': 'Selected subject must belong to your school.'})

        if upload and external_url:
            raise serializers.ValidationError({'external_url': 'Provide either a file upload or an external URL, not both.'})

        if not upload and not external_url and not getattr(self.instance, 'file_data', '') and not getattr(self.instance, 'external_url', ''):
            raise serializers.ValidationError({'upload': 'Upload a file or provide an external URL.'})

        if upload:
            max_size = 12 * 1024 * 1024 if material_type == SubjectMaterial.MaterialType.VIDEO else 8 * 1024 * 1024
            if upload.size > max_size:
                limit_label = '12MB' if material_type == SubjectMaterial.MaterialType.VIDEO else '8MB'
                raise serializers.ValidationError({'upload': f'This file exceeds the maximum allowed size of {limit_label}.'})

            allowed_types = {
                SubjectMaterial.MaterialType.PDF: {'application/pdf'},
                SubjectMaterial.MaterialType.VIDEO: {'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'},
                # SVG excluded: it can carry <script>/onload, and this content-type
                # check trusts the client-supplied header, not sniffed file bytes --
                # a teacher could label a script-bearing SVG as course "image" and
                # every enrolled student would see it served as image/svg+xml.
                SubjectMaterial.MaterialType.IMAGE: {'image/jpeg', 'image/png', 'image/gif', 'image/webp'},
                SubjectMaterial.MaterialType.DOCUMENT: {
                    'text/plain',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                },
                SubjectMaterial.MaterialType.LINK: set(),
            }
            expected_types = allowed_types.get(material_type, set())
            if expected_types and upload.content_type not in expected_types:
                raise serializers.ValidationError({'upload': f'The uploaded file is not valid for {material_type} materials.'})

        return attrs

    def create(self, validated_data):
        upload = validated_data.pop('upload', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if upload:
            encoded = base64.b64encode(upload.read()).decode('utf-8')
            validated_data['file_name'] = upload.name
            validated_data['mime_type'] = upload.content_type or ''
            validated_data['file_size_bytes'] = upload.size
            validated_data['file_data'] = f'data:{upload.content_type};base64,{encoded}'
            validated_data['external_url'] = ''

        if user and getattr(user, 'school', None):
            validated_data['school'] = user.school
            validated_data['uploaded_by'] = user

        return super().create(validated_data)

    def update(self, instance, validated_data):
        upload = validated_data.pop('upload', None)
        if upload:
            encoded = base64.b64encode(upload.read()).decode('utf-8')
            instance.file_name = upload.name
            instance.mime_type = upload.content_type or ''
            instance.file_size_bytes = upload.size
            instance.file_data = f'data:{upload.content_type};base64,{encoded}'
            instance.external_url = ''
        elif (validated_data.get('external_url') or '').strip():
            instance.file_name = ''
            instance.mime_type = ''
            instance.file_size_bytes = None
            instance.file_data = ''

        return super().update(instance, validated_data)


class SequenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sequence
        fields = ['id', 'school', 'name', 'academic_year', 'term', 'start_date', 'end_date', 'is_active', 'marks_deadline']
        read_only_fields = ['id']


class GradeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_admission = serializers.CharField(source='student.admission_number', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    coefficient = serializers.DecimalField(source='subject.coefficient', max_digits=5, decimal_places=2, read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    grade_letter = serializers.SerializerMethodField()
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    # Sequence context so student/parent views can place every mark in its real
    # sequence column (Seq 1..6) regardless of the active term.
    sequence_name = serializers.CharField(source='sequence.name', read_only=True)
    sequence_term = serializers.IntegerField(source='sequence.term', read_only=True)

    class Meta:
        model = Grade
        fields = [
            'id', 'student', 'student_name', 'student_admission', 'subject', 'subject_name',
            'subject_code', 'coefficient', 'sequence', 'sequence_name', 'sequence_term',
            'school_class', 'school_class_name', 'class_name_snapshot',
            'score', 'grade_letter', 'teacher', 'teacher_name',
            'comment', 'created', 'modified'
        ]
        read_only_fields = ['id', 'school_class', 'school_class_name', 'class_name_snapshot', 'created', 'modified']
        validators = []

    def get_grade_letter(self, obj):
        return obj.get_grade_letter()

    def validate(self, attrs):
        student = attrs.get('student') or getattr(self.instance, 'student', None)
        subject = attrs.get('subject') or getattr(self.instance, 'subject', None)
        teacher = attrs.get('teacher') or getattr(self.instance, 'teacher', None)
        sequence = attrs.get('sequence') or getattr(self.instance, 'sequence', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role == 'TEACHER':
            teacher = user

        if not student or not subject or not sequence:
            return attrs

        if student.school_id != subject.school_id or student.school_id != sequence.school_id:
            raise serializers.ValidationError('Student, subject, and sequence must belong to the same school.')

        validate_teacher_active_term(user, sequence)

        if teacher and teacher.school_id != student.school_id:
            raise serializers.ValidationError({'teacher': 'Teacher must belong to the same school as the student.'})

        enrollment_query = StudentSubjectEnrollment.objects.filter(
            student=student,
            class_subject__subject=subject,
        ).select_related('class_subject')
        if student.school_class_id:
            enrollment_query = enrollment_query.filter(class_subject__school_class=student.school_class)
        elif student.student_class:
            enrollment_query = enrollment_query.filter(
                class_subject__school_class__school=student.school,
                class_subject__school_class__name=student.student_class,
            )
        enrollment = enrollment_query.first()
        class_subject = enrollment.class_subject if enrollment else None

        if not class_subject:
            class_subject_query = ClassSubject.objects.filter(
                subject=subject,
                school_class__school=student.school,
            )
            if student.school_class_id:
                class_subject_query = class_subject_query.filter(school_class=student.school_class)
            elif student.student_class:
                class_subject_query = class_subject_query.filter(school_class__name=student.student_class)
            class_subject = class_subject_query.select_related('teacher', 'school_class').first()

        if not class_subject:
            raise serializers.ValidationError({'subject': 'This subject is not assigned to the student class.'})

        if enrollment and not enrollment.is_active:
            raise serializers.ValidationError({'subject': 'This optional subject has been removed from the student curriculum.'})

        if teacher and class_subject.teacher_id and class_subject.teacher_id != teacher.id:
            raise serializers.ValidationError({'teacher': 'Only the assigned teacher for this class subject can enter marks.'})

        if user and user.role == 'TEACHER':
            teaches_subject = (
                subject.teacher_id == user.id
                or class_subject.teacher_id == user.id
            )
            if not teaches_subject:
                raise serializers.ValidationError({'subject': 'You can only record grades for subjects you teach.'})

        return attrs


class GradeBulkCreateSerializer(serializers.Serializer):
    sequence_id = serializers.UUIDField()
    class_subject_id = serializers.UUIDField(required=False, allow_null=True)
    grades = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
    )

    def validate_grades(self, value):
        if not value:
            raise serializers.ValidationError("At least one grade is required.")
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        sequence_id = attrs['sequence_id']
        class_subject_id = attrs.get('class_subject_id')

        try:
            sequence = Sequence.objects.select_related('school').get(id=sequence_id)
        except Sequence.DoesNotExist:
            raise serializers.ValidationError({'sequence_id': 'Selected sequence was not found.'})

        if not user or user.role != 'TEACHER':
            raise serializers.ValidationError({'detail': 'Only teachers can submit marks.'})
        if sequence.school_id != user.school_id:
            raise serializers.ValidationError({'sequence_id': 'Selected sequence does not belong to your school.'})

        validate_teacher_active_term(user, sequence)

        selected_class_subject = None
        if class_subject_id:
            selected_class_subject = ClassSubject.objects.select_related(
                'school_class',
                'subject',
                'teacher',
            ).filter(
                id=class_subject_id,
                school_class__school=sequence.school,
            ).first()
            if not selected_class_subject:
                raise serializers.ValidationError({'class_subject_id': 'Selected class subject was not found in your school.'})
            if not self._teacher_can_grade_class_subject(user, selected_class_subject):
                raise serializers.ValidationError({'class_subject_id': 'You can only submit marks for class subjects assigned to you.'})

        cleaned_grades = []
        for index, raw_grade in enumerate(attrs['grades'], start=1):
            cleaned_grades.append(
                self._validate_grade_row(
                    raw_grade,
                    index,
                    user,
                    sequence,
                    selected_class_subject,
                )
            )

        attrs['sequence'] = sequence
        attrs['class_subject'] = selected_class_subject
        attrs['cleaned_grades'] = cleaned_grades
        return attrs

    def _teacher_can_grade_class_subject(self, user, class_subject):
        if class_subject.teacher_id:
            return class_subject.teacher_id == user.id
        return class_subject.subject.teacher_id == user.id

    def _validate_grade_row(self, raw_grade, index, user, sequence, selected_class_subject):
        student_id = raw_grade.get('student')
        subject_id = raw_grade.get('subject') or (
            selected_class_subject.subject_id if selected_class_subject else None
        )
        nested_sequence_id = raw_grade.get('sequence')
        score = raw_grade.get('score')

        if not student_id:
            raise serializers.ValidationError({'grades': f'Row {index}: student is required.'})
        if not subject_id:
            raise serializers.ValidationError({'grades': f'Row {index}: subject is required.'})
        if nested_sequence_id and str(nested_sequence_id) != str(sequence.id):
            raise serializers.ValidationError({'grades': f'Row {index}: all marks must belong to the selected sequence.'})

        try:
            score_decimal = Decimal(str(score))
        except Exception:
            raise serializers.ValidationError({'grades': f'Row {index}: mark must be a number between 0 and 20.'})
        if score_decimal < Decimal('0') or score_decimal > Decimal('20'):
            raise serializers.ValidationError({'grades': f'Row {index}: mark must be between 0 and 20.'})

        student = students_api.list_students(school=sequence.school).filter(
            id=student_id
        ).first()
        if not student:
            raise serializers.ValidationError({'grades': f'Row {index}: selected student was not found in your school.'})

        subject = Subject.objects.filter(id=subject_id, school=sequence.school).first()
        if not subject:
            raise serializers.ValidationError({'grades': f'Row {index}: selected subject was not found in your school.'})

        class_subject = selected_class_subject
        if class_subject:
            if class_subject.subject_id != subject.id:
                raise serializers.ValidationError({'grades': f'Row {index}: subject does not match the selected teacher class subject.'})
            if student.school_class_id:
                belongs_to_class = student.school_class_id == class_subject.school_class_id
            else:
                belongs_to_class = student.student_class == class_subject.school_class.name
            if not belongs_to_class:
                raise serializers.ValidationError({'grades': f'Row {index}: student does not belong to the selected class.'})
        else:
            class_subject_query = ClassSubject.objects.select_related('subject', 'teacher', 'school_class').filter(
                subject=subject,
                school_class__school=sequence.school,
            )
            if student.school_class_id:
                class_subject_query = class_subject_query.filter(school_class=student.school_class)
            elif student.student_class:
                class_subject_query = class_subject_query.filter(school_class__name=student.student_class)
            class_subject = class_subject_query.first()
            if not class_subject:
                raise serializers.ValidationError({'grades': f'Row {index}: this subject is not assigned to the student class.'})
            if not self._teacher_can_grade_class_subject(user, class_subject):
                raise serializers.ValidationError({'grades': f'Row {index}: you can only submit marks for subjects assigned to you.'})

        enrollment = StudentSubjectEnrollment.objects.filter(
            student=student,
            class_subject=class_subject,
        ).first()
        if enrollment and not enrollment.is_active:
            raise serializers.ValidationError({'grades': f'Row {index}: this optional subject has been removed from the student curriculum.'})

        return {
            'student': student,
            'subject': subject,
            'score': score_decimal,
            'comment': raw_grade.get('comment', '') or '',
        }

    def create(self, validated_data):
        sequence = validated_data['sequence']
        grades_data = validated_data['cleaned_grades']
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        grades = []
        for grade_data in grades_data:
            student = grade_data['student']
            subject = grade_data['subject']

            grade, _ = Grade.objects.update_or_create(
                student=student,
                subject=subject,
                sequence=sequence,
                defaults={
                    'school': sequence.school,
                    'school_class': student.school_class,
                    'class_name_snapshot': student.school_class.name if student.school_class_id else student.student_class,
                    'score': grade_data['score'],
                    'teacher': user,
                    'comment': grade_data.get('comment', ''),
                },
            )
            grades.append(grade)
        return grades


class TermResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_admission = serializers.CharField(source='student.admission_number', read_only=True)

    class Meta:
        model = TermResult
        fields = [
            'id', 'student', 'student_name', 'student_admission', 'school', 'academic_year',
            'term', 'average', 'rank', 'total_students', 'is_promoted', 'teacher_comment',
            'conduct', 'principal_remark', 'created'
        ]
        # 'school' is derived from the student in validate() below, never taken
        # from the client -- otherwise a school admin of School A could pass
        # {"student": "<School B student id>", "school": "<any school>"} and
        # forge a promotion/result record for another school's student.
        read_only_fields = ['id', 'school', 'rank', 'created']

    def validate(self, attrs):
        student = attrs.get('student') or getattr(self.instance, 'student', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if student and user and student.school_id != user.school_id:
            raise serializers.ValidationError({'student': 'Student must belong to your school.'})
        if user:
            attrs['school'] = user.school
        return attrs


class AnnualResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_admission = serializers.CharField(source='student.admission_number', read_only=True)

    class Meta:
        model = AnnualResult
        fields = [
            'id', 'student', 'student_name', 'student_admission', 'school', 'academic_year',
            'annual_average', 'rank', 'is_on_honour_roll', 'is_promoted', 'created'
        ]
        # See TermResultSerializer above: 'school' must be derived from the
        # student, not accepted from the client, to prevent cross-school forgery.
        read_only_fields = ['id', 'school', 'rank', 'created']

    def validate(self, attrs):
        student = attrs.get('student') or getattr(self.instance, 'student', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if student and user and student.school_id != user.school_id:
            raise serializers.ValidationError({'student': 'Student must belong to your school.'})
        if user:
            attrs['school'] = user.school
        return attrs


class ReportCardPublicationSerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    sequence_name = serializers.CharField(source='sequence.name', read_only=True)
    published_by_name = serializers.CharField(source='published_by.get_full_name', read_only=True)

    class Meta:
        model = ReportCardPublication
        fields = [
            'id',
            'school',
            'school_class',
            'school_class_name',
            'class_name',
            'scope',
            'sequence',
            'sequence_name',
            'academic_year',
            'term',
            'is_published',
            'published_by',
            'published_by_name',
            'published_at',
            'created',
            'modified',
        ]
        read_only_fields = [
            'id',
            'school',
            'school_class_name',
            'sequence_name',
            'published_by',
            'published_by_name',
            'published_at',
            'created',
            'modified',
        ]


class ReportCardSerializer(serializers.Serializer):
    student = StudentListSerializer()
    sequence = SequenceSerializer()
    grades = GradeSerializer(many=True)
    average = serializers.DecimalField(max_digits=5, decimal_places=2)
    rank = serializers.IntegerField()
    total_students = serializers.IntegerField()
    promotion_status = serializers.CharField()
