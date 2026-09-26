"""What a teacher teaches, as the staff roster prints it.

A teacher can be attached to a subject two ways: named on the subject itself,
or assigned to it for one class. A roster that read only one of them would show
working teachers as teaching nothing, which is exactly what a head of
department uses the document to check.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.grades.models import ClassSubject, Subject
from apps.schools.models import School, SchoolClass
from apps.users.serializers import UserListSerializer

User = get_user_model()


class SubjectsTaughtTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='GHS-SUBJ',
            name='Government High School',
            short_name='GHS',
            principal='The Principal',
            location='Bamenda',
            email='ghs-subj@example.com',
        )
        self.form_five = SchoolClass.objects.create(school=self.school, name='Form 5')
        self.teacher = User.objects.create_user(
            matricule='TCH-500',
            name='A Teacher',
            email='teacher500@example.com',
            role='TEACHER',
            password='not-a-real-password',
        )
        self.teacher.school = self.school
        self.teacher.save(update_fields=['school'])

    def _subject(self, name, code, teacher=None):
        return Subject.objects.create(
            school=self.school,
            name=name,
            code=code,
            level='Form 5',
            coefficient=Decimal('2.00'),
            teacher=teacher,
        )

    def _serialized(self, user):
        return UserListSerializer(user).data['subjects_taught']

    def test_a_subject_led_by_the_teacher_is_listed(self):
        self._subject('Mathematics', 'MATH', teacher=self.teacher)

        self.assertEqual(self._serialized(self.teacher), ['Mathematics'])

    def test_a_class_assignment_is_listed_too(self):
        """The common case: assigned to teach one subject to one class."""
        subject = self._subject('Physics', 'PHY')
        ClassSubject.objects.create(
            school_class=self.form_five, subject=subject, teacher=self.teacher
        )

        self.assertEqual(self._serialized(self.teacher), ['Physics'])

    def test_both_sources_are_merged_without_repeating(self):
        subject = self._subject('Chemistry', 'CHEM', teacher=self.teacher)
        ClassSubject.objects.create(
            school_class=self.form_five, subject=subject, teacher=self.teacher
        )
        other = self._subject('Biology', 'BIO')
        ClassSubject.objects.create(
            school_class=self.form_five, subject=other, teacher=self.teacher
        )

        self.assertEqual(self._serialized(self.teacher), ['Biology', 'Chemistry'])

    def test_someone_elses_subject_is_not_listed(self):
        other_teacher = User.objects.create_user(
            matricule='TCH-501',
            name='Another Teacher',
            email='teacher501@example.com',
            role='TEACHER',
            password='not-a-real-password',
        )
        self._subject('History', 'HIST', teacher=other_teacher)

        self.assertEqual(self._serialized(self.teacher), [])

    def test_a_teacher_with_nothing_assigned_reads_as_empty(self):
        self.assertEqual(self._serialized(self.teacher), [])

    def test_a_bursar_is_not_asked_what_they_teach(self):
        bursar = User.objects.create_user(
            matricule='BUR-500',
            name='A Bursar',
            email='bursar500@example.com',
            role='BURSAR',
            password='not-a-real-password',
        )

        self.assertEqual(self._serialized(bursar), [])
