"""Who may download which library request document.

The requester document belongs to the person who made the request; the
official record (with internal loan notes) belongs to that school's librarians
and administrators. Request ids are sequential, so every case below also
checks that guessing a neighbouring id gets nothing.
"""

from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.library.models import Book, BookCategory, BookLoan, BookRequest
from apps.schools.models import School, SchoolClass
from apps.students.models import Student

User = get_user_model()


def _school(code, name):
    return School.objects.create(
        id=code,
        name=name,
        short_name=code,
        principal='Principal',
        motto='Knowledge and Service',
        location='Buea',
        address='Molyko Road',
        email=f'{code.lower()}@example.com',
        phone='237650000000',
        school_type='general',
        subsystem='anglophone',
    )


def _user(school, matricule, name, role):
    return User.objects.create_user(
        matricule=matricule,
        name=name,
        email=f'{matricule.lower()}@example.com',
        role=role,
        school=school,
        password='password123',
        is_license_paid=True,
    )


@mock.patch('apps.registry.api.is_installed_for_user', return_value=True)
class LibraryRequestDocumentTests(APITestCase):
    def setUp(self):
        self.school = _school('LIB-A', 'Library Test College A')
        self.other_school = _school('LIB-B', 'Library Test College B')
        self.form5 = SchoolClass.objects.create(school=self.school, name='Form 5 Science')

        self.student = _user(self.school, 'STU-A1', 'Nsame Rene', 'STUDENT')
        Student.objects.create(
            user=self.student, school=self.school, school_class=self.form5,
            student_class='Form 5 Science', admission_number='0001',
        )
        self.classmate = _user(self.school, 'STU-A2', 'Other Student', 'STUDENT')
        Student.objects.create(
            user=self.classmate, school=self.school, school_class=self.form5,
            student_class='Form 5 Science', admission_number='0002',
        )
        self.teacher = _user(self.school, 'TCH-A1', 'Teacher A', 'TEACHER')
        self.librarian = _user(self.school, 'LIB-A1', 'Librarian A', 'LIBRARIAN')
        self.admin = _user(self.school, 'ADM-A1', 'Admin A', 'SCHOOL_ADMIN')
        self.other_librarian = _user(self.other_school, 'LIB-B1', 'Librarian B', 'LIBRARIAN')

        category = BookCategory.objects.create(school=self.school, name='Education')
        self.book = Book.objects.create(
            school=self.school, title='I Have A Dream About Education', author='A. Writer',
            category=category, location='Shelf B2', total_copies=3, available_copies=2,
        )
        self.request = BookRequest.objects.create(
            school=self.school, book=self.book, requester=self.student, request_type='loan',
        )
        self.classmate_request = BookRequest.objects.create(
            school=self.school, book=self.book, requester=self.classmate, request_type='loan',
        )

    def _requester_url(self, book_request):
        return f'/api/v1/library/requests/{book_request.pk}/requester-document/'

    def _official_url(self, book_request):
        return f'/api/v1/library/requests/{book_request.pk}/official-record/'

    def _issue(self, notes='', returned=False):
        loan = BookLoan.objects.create(
            school=self.school, book=self.book, borrower=self.student, librarian=self.librarian,
            due_date=date.today() + timedelta(days=14), notes=notes,
            status='Returned' if returned else 'Active',
            returned_date=date.today() if returned else None,
        )
        self.request.status = 'fulfilled'
        self.request.reviewed_by = self.librarian
        self.request.fulfilled_at = timezone.now()
        self.request.approved_at = self.request.fulfilled_at
        self.request.loan = loan
        self.request.save()
        return loan

    # --- requester document -------------------------------------------------

    def test_student_downloads_own_document_with_student_fields(self, _installed):
        self.client.force_authenticate(self.student)
        response = self.client.get(self._requester_url(self.request))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['reference'], f'LR-{self.request.pk:04d}')
        self.assertEqual(data['display_status'], 'pending')
        self.assertEqual(data['requester']['name'], 'Nsame Rene')
        self.assertEqual(data['requester']['class_name'], 'Form 5 Science')
        self.assertEqual(data['requester']['admission_number'], '0001')
        self.assertEqual(data['school']['name'], 'Library Test College A')
        self.assertEqual(data['school']['motto'], 'Knowledge and Service')
        self.assertEqual(response['Cache-Control'], 'no-store')
        # Nothing unreviewed is sent as a blank.
        self.assertNotIn('review', data)
        self.assertNotIn('loan', data)

    def test_student_cannot_download_another_students_document(self, _installed):
        self.client.force_authenticate(self.student)
        response = self.client.get(self._requester_url(self.classmate_request))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_cannot_use_requester_document_of_someone_else(self, _installed):
        self.client.force_authenticate(self.librarian)
        response = self.client.get(self._requester_url(self.request))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_requester_document_never_carries_administrative_notes(self, _installed):
        self._issue(notes='Spine damaged on return; do not lend again.')
        self.client.force_authenticate(self.student)
        response = self.client.get(self._requester_url(self.request))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('administrative_notes', response.data)
        self.assertNotIn('timeline', response.data)
        self.assertNotIn('Spine damaged', str(response.data))
        self.assertEqual(response.data['display_status'], 'issued')
        self.assertIn('due_date', response.data['loan'])
        self.assertNotIn('issued_by', response.data['loan'])

    def test_non_numeric_id_is_404_not_500(self, _installed):
        self.client.force_authenticate(self.student)
        response = self.client.get('/api/v1/library/requests/abc/requester-document/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- official record ----------------------------------------------------

    def test_student_cannot_download_official_record_even_for_own_request(self, _installed):
        self.client.force_authenticate(self.student)
        response = self.client.get(self._official_url(self.request))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_cannot_download_official_record(self, _installed):
        self.client.force_authenticate(self.teacher)
        response = self.client.get(self._official_url(self.request))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_librarian_and_admin_download_official_record(self, _installed):
        self._issue(notes='Spine damaged on return.', returned=True)
        for user in (self.librarian, self.admin):
            self.client.force_authenticate(user)
            response = self.client.get(self._official_url(self.request))
            self.assertEqual(response.status_code, status.HTTP_200_OK, user.role)
            data = response.data
            self.assertEqual(data['display_status'], 'returned')
            self.assertEqual(data['administrative_notes'], 'Spine damaged on return.')
            self.assertEqual(data['book']['location'], 'Shelf B2')
            self.assertEqual(data['loan']['issued_by'], 'Librarian A')
            events = [event['event'] for event in data['timeline']]
            self.assertEqual(events, ['submitted', 'issued', 'returned'])

    def test_librarian_of_another_school_gets_404(self, _installed):
        self.client.force_authenticate(self.other_librarian)
        response = self.client.get(self._official_url(self.request))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejected_request_has_no_invented_review_date(self, _installed):
        self.request.status = 'rejected'
        self.request.reviewed_by = self.librarian
        self.request.review_note = 'No copies left this term.'
        self.request.save()
        self.client.force_authenticate(self.librarian)
        data = self.client.get(self._official_url(self.request)).data
        self.assertEqual(data['review']['reviewed_by'], 'Librarian A')
        self.assertNotIn('reviewed_at', data['review'])
        rejected = [event for event in data['timeline'] if event['event'] == 'rejected'][0]
        self.assertNotIn('at', rejected)
