from decimal import Decimal

from django.db.models import Sum
from django.test import TestCase
from rest_framework.test import APIRequestFactory, APITestCase

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


class SchoolFeeAssignmentAnnotatedListTests(APITestCase):
    """Regression test: SchoolFeeAssignmentSerializer's student_count/
    total_collected/total_outstanding/paid_students/incomplete_students/
    unpaid_students fields used to each run their own query against
    obj.student_records. The view now annotates these on the queryset
    instead -- this pins down that the annotated values still match what a
    fresh per-instance query against the same records would compute."""

    def setUp(self):
        self.school = School.objects.create(
            id='GBHS-ANN', name='Annotated Fee Test School', short_name='GBHS ANN',
            principal='Mr Peter', location='Town', email='ann-school@example.com',
            phone='+237670000099', school_type='general', subsystem='bilingual',
        )
        self.school_class = SchoolClass.objects.create(school=self.school, name='FORM 5')
        self.bursar = User.objects.create_user(
            matricule='BUR-ANN-001', name='Bursar Ann', email='bursar.ann@example.com',
            role='BURSAR', school=self.school, password='pass12345',
        )
        student_user_paid = User.objects.create_user(
            matricule='STU-ANN-001', name='Student Paid', email='paid.ann@example.com',
            role='STUDENT', school=self.school, password='pass12345',
        )
        student_user_unpaid = User.objects.create_user(
            matricule='STU-ANN-002', name='Student Unpaid', email='unpaid.ann@example.com',
            role='STUDENT', school=self.school, password='pass12345',
        )
        Student.objects.create(
            user=student_user_paid, school=self.school, school_class=self.school_class,
            student_class='FORM 5', class_level='Form 5', section='General', admission_number='ADM-ANN-001',
        )
        Student.objects.create(
            user=student_user_unpaid, school=self.school, school_class=self.school_class,
            student_class='FORM 5', class_level='Form 5', section='General', admission_number='ADM-ANN-002',
        )
        self.assignment = SchoolFeeAssignment.objects.create(
            school=self.school, school_class=self.school_class, academic_year='2026-2027',
            amount=Decimal('100000.00'), created_by=self.bursar, updated_by=self.bursar,
        )
        sync_class_fee_assignment_records(self.assignment)

        factory = APIRequestFactory()
        request = factory.patch('/fees/student-school-fees/')
        request.user = self.bursar
        paid_record = StudentSchoolFeeRecord.objects.get(fee_assignment=self.assignment, student__user=student_user_paid)
        serializer = StudentSchoolFeeRecordUpdateSerializer(
            instance=paid_record, data={'amount_paid': '100000.00'}, partial=True, context={'request': request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

    def test_annotated_counts_match_unannotated_computation(self):
        self.client.force_authenticate(self.bursar)

        response = self.client.get('/api/v1/fees/school-fee-assignments/')

        self.assertEqual(response.status_code, 200)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        row = next(r for r in results if r['id'] == str(self.assignment.id))

        active_records = StudentSchoolFeeRecord.objects.filter(fee_assignment=self.assignment, is_active=True)
        self.assertEqual(row['student_count'], active_records.count())
        self.assertEqual(Decimal(str(row['total_expected'])), self.assignment.amount * active_records.count())
        self.assertEqual(
            Decimal(str(row['total_collected'])),
            active_records.aggregate(total=Sum('amount_paid'))['total'],
        )
        self.assertEqual(row['paid_students'], active_records.filter(status=StudentSchoolFeeRecord.STATUS_PAID).count())
        self.assertEqual(row['unpaid_students'], active_records.filter(status=StudentSchoolFeeRecord.STATUS_UNPAID).count())
        self.assertEqual(row['paid_students'], 1)
        self.assertEqual(row['unpaid_students'], 1)
