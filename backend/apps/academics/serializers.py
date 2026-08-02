from rest_framework import serializers
from .models import AcademicYear, Term, StudentPromotion, ClassSubject, StudentEnrollment, SubjectGrade
from apps.schools.models import SchoolClass
from apps.users.models import User


class AcademicYearSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)
    terms_count = serializers.SerializerMethodField()

    class Meta:
        model = AcademicYear
        fields = [
            'id',
            'school',
            'school_name',
            'name',
            'start_date',
            'end_date',
            'is_current',
            'is_active',
            'terms_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_terms_count(self, obj):
        return obj.terms.count()


class TermSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    school_id = serializers.CharField(source='academic_year.school.id', read_only=True)

    class Meta:
        model = Term
        fields = [
            'id',
            'academic_year',
            'academic_year_name',
            'school_id',
            'name',
            'start_date',
            'end_date',
            'is_current',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ClassSubjectSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    school_id = serializers.CharField(source='school_class.school.id', read_only=True)

    class Meta:
        model = ClassSubject
        fields = [
            'id',
            'school_class',
            'class_name',
            'school_id',
            'subject_name',
            'teacher',
            'teacher_name',
            'coefficient',
            'is_compulsory',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        school_class = data.get('school_class')
        teacher = data.get('teacher')

        if teacher and school_class and teacher.school_id != school_class.school_id:
            raise serializers.ValidationError(
                {'teacher': 'Teacher must belong to the same school as the class.'}
            )

        return data


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    subject_name = serializers.CharField(source='class_subject.subject_name', read_only=True)
    term_name = serializers.CharField(source='term.get_name_display', read_only=True)

    class Meta:
        model = StudentEnrollment
        fields = [
            'id',
            'student',
            'student_name',
            'term',
            'term_name',
            'class_subject',
            'subject_name',
            'is_enrolled',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class SubjectGradeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='enrollment.student.user.get_full_name', read_only=True)
    subject_name = serializers.CharField(source='enrollment.class_subject.subject_name', read_only=True)
    term_name = serializers.CharField(source='enrollment.term.get_name_display', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)
    percentage = serializers.ReadOnlyField()
    grade_letter = serializers.ReadOnlyField()

    class Meta:
        model = SubjectGrade
        fields = [
            'id',
            'enrollment',
            'student_name',
            'subject_name',
            'term_name',
            'grade_type',
            'score',
            'max_score',
            'percentage',
            'grade_letter',
            'recorded_by',
            'recorded_by_name',
            'recorded_date',
        ]
        read_only_fields = ['id', 'recorded_date']


class StudentPromotionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    current_class_name = serializers.CharField(source='current_class.name', read_only=True)
    promoted_to_class_name = serializers.CharField(source='promoted_to_class.name', read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    promoted_by_name = serializers.CharField(source='promoted_by.get_full_name', read_only=True)

    class Meta:
        model = StudentPromotion
        fields = [
            'id',
            'student',
            'student_name',
            'academic_year',
            'academic_year_name',
            'current_class',
            'current_class_name',
            'promoted_to_class',
            'promoted_to_class_name',
            'status',
            'average_score',
            'promotion_date',
            'promoted_by',
            'promoted_by_name',
            'remarks',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        promoted_to_class = data.get('promoted_to_class')
        student = data.get('student')

        if promoted_to_class and student and promoted_to_class.school_id != student.school_id:
            raise serializers.ValidationError(
                {'promoted_to_class': 'Promoted class must belong to the same school.'}
            )

        return data
