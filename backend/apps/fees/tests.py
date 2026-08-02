from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.schools.models import School, SchoolClass
from apps.students.models import Student
from apps.users.models import User
from .ledger import sync_class_fee_assignment_records
from .models import SchoolFeeAssignment, StudentSchoolFeeRecord
from .serializers import PaymentCreateSerializer, StudentSchoolFeeRecordUpdateSerializer


class SchoolFeeLedgerTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.school = School.objects.create(
            id='GBHS-P',
            name='Government Bilingual High School Prime',
            short_name='GBHS P',
            principal='Mr Peter',
            motto='Excellence',
            description='Test school',
            location='Town',
            region='West',
            division='Division',
            sub_division='Sub Division',
            city_village='Village',
            address='Campus Road',
            phone='+237670000000',
            email='school@example.com',
            status='Active',
        )
        self.school_class = SchoolClass.objects.create(
            school=self.school,
            name='FORM 4',
        )
        self.bursar = User.objects.create_user(
            matricule='BUR0001',
            name='Bursar Jane',
            email='bursar@example.com',
            role='BURSAR',
            school=self.school,
            password='pass12345',
        )
        self.student_user_one = User.objects.create_user(
            matricule='STU0001',
            name='Student One',
            email='student1@example.com',
            role='STUDENT',
            school=self.school,
            password='pass12345',
        )
        self.student_user_two = User.objects.create_user(
            matricule='STU0002',
            name='Student Two',
            email='student2@example.com',
            role='STUDENT',
            school=self.school,
            password='pass12345',
        )
        self.student_one = Student.objects.create(
            user=self.student_user_one,
            school=self.school,
            school_class=self.school_class,
            student_class='FORM 4',
            class_level='Form 4',
            section='General',
            admission_number='ADM-001',
        )
        self.student_two = Student.objects.create(
            user=self.student_user_two,
            school=self.school,
            school_class=self.school_class,
            student_class='FORM 4',
            class_level='Form 4',
            section='General',
            admission_number='ADM-002',
        )

    def test_class_fee_assignment_syncs_students(self):
        assignment = SchoolFeeAssignment.objects.create(
            school=self.school,
            school_class=self.school_class,
            academic_year='2026-2027',
            amount=Decimal('125000.00'),
            created_by=self.bursar,
            updated_by=self.bursar,
        )

        sync_class_fee_assignment_records(assignment)

        records = StudentSchoolFeeRecord.objects.filter(fee_assignment=assignment, is_active=True)
        self.assertEqual(records.count(), 2)
        self.assertEqual(records.first().status, StudentSchoolFeeRecord.STATUS_UNPAID)
        self.assertEqual(records.first().balance, Decimal('125000.00'))

    def test_updating_student_fee_record_recalculates_status(self):
        assignment = SchoolFeeAssignment.objects.create(
            school=self.school,
            school_class=self.school_class,
            academic_year='2026-2027',
            amount=Decimal('100000.00'),
            created_by=self.bursar,
            updated_by=self.bursar,
        )
        sync_class_fee_assignment_records(assignment)
        record = StudentSchoolFeeRecord.objects.get(fee_assignment=assignment, student=self.student_one)

        request = self.factory.patch('/fees/student-school-fees/')
        request.user = self.bursar
        serializer = StudentSchoolFeeRecordUpdateSerializer(
            instance=record,
            data={'amount_paid': '60000.00', 'notes': 'First installment'},
            partial=True,
            context={'request': request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        record.refresh_from_db()
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_INCOMPLETE)
        self.assertEqual(record.balance, Decimal('40000.00'))

    def test_staff_cannot_mark_platform_fee_paid_manually(self):
        request = self.factory.post('/fees/payments/')
        request.user = self.bursar
        serializer = PaymentCreateSerializer(
            data={
                'payer': str(self.student_user_one.id),
                'amount': '2000.00',
                'currency': 'XAF',
                'payment_method': 'cash',
                'payment_date': '2026-05-09',
                'mark_license_paid': True,
                'license_beneficiary': str(self.student_user_one.id),
            },
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('mark_license_paid', serializer.errors)
