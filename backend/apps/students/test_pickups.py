"""Authorised pick-up: isolation, role matrix, parent read-only, limit, soft delete."""
from rest_framework.test import APITestCase

from apps.schools.models import ClassTeacherAssignment, SchoolClass
from apps.students.models import AuthorizedPickup, ParentStudentLink
from apps.students.pickups import MAX_ACTIVE_PER_CHILD, normalize_pickup_phone
from apps.students.test_school_life import make_pupil, make_school, make_user

URL = '/api/v1/students/pickups/'


class PickupTests(APITestCase):
    def setUp(self):
        self.school = make_school('PK-ONE')
        self.other = make_school('PK-TWO')
        self.class_a = SchoolClass.objects.create(school=self.school, name='Class 1')
        self.class_b = SchoolClass.objects.create(school=self.school, name='Class 2')
        self.other_class = SchoolClass.objects.create(school=self.other, name='Class 1')
        self.admin = make_user('ADM-PK1', 'SCHOOL_ADMIN', self.school)
        self.other_admin = make_user('ADM-PK2', 'SCHOOL_ADMIN', self.other)
        self.teacher_a = make_user('TCH-PKA', 'TEACHER', self.school)
        self.teacher_b = make_user('TCH-PKB', 'TEACHER', self.school)
        self.bursar = make_user('BUR-PK1', 'BURSAR', self.school)
        ClassTeacherAssignment.objects.create(school_class=self.class_a, teacher=self.teacher_a)
        ClassTeacherAssignment.objects.create(school_class=self.class_b, teacher=self.teacher_b)
        self.pupil_a = make_pupil(self.school, self.class_a, 'Ada Nkeng', 'A1')
        self.pupil_b = make_pupil(self.school, self.class_b, 'Bob Tabi', 'B1')
        self.pupil_other = make_pupil(self.other, self.other_class, 'Zed Foreign', 'Z1')
        self.parent = make_user('PAR-PK1', 'PARENT', self.school)
        ParentStudentLink.objects.create(parent=self.parent, student=self.pupil_a, relationship='mother')
        self.stranger = make_user('PAR-PK2', 'PARENT', self.school)
        ParentStudentLink.objects.create(parent=self.stranger, student=self.pupil_b, relationship='father')

    def payload(self, pupil=None, **extra):
        data = {'student': str(pupil.id if pupil else self.pupil_a.id), 'full_name': 'Uncle Paul',
                'relationship': 'uncle', 'phone': '650 11 22 33', 'id_note': 'ID ends 4521'}
        data.update(extra)
        return data

    def post(self, user, **kw):
        self.client.force_authenticate(user)
        return self.client.post(URL, self.payload(**kw), format='json')

    def test_admin_creates_lists_and_normalises_phone(self):
        r = self.post(self.admin)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['phone'], '237650112233')
        self.assertEqual(r.data['student_name'], 'Ada Nkeng')
        rows = self.client.get(URL, {'student': str(self.pupil_a.id)}).data
        self.assertEqual([x['full_name'] for x in rows], ['Uncle Paul'])
        self.assertEqual(AuthorizedPickup.objects.get().created_by, self.admin)

    def test_full_name_required_and_bad_phone(self):
        self.assertEqual(self.post(self.admin, full_name='  ').status_code, 400)
        self.assertEqual(self.post(self.admin, phone='abc').status_code, 400)
        self.assertEqual(self.post(self.admin, phone='123').status_code, 400)
        self.assertEqual(self.post(self.admin, phone='').status_code, 201)

    def test_isolation_other_school(self):
        pickup = AuthorizedPickup.objects.create(
            school=self.other, student=self.pupil_other, full_name='Foreign Person')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(URL, {'student': str(self.pupil_other.id)}).status_code, 404)
        self.assertEqual(self.client.get(URL).data, [])
        self.assertEqual(self.client.post(URL, self.payload(self.pupil_other), format='json').status_code, 404)
        self.assertEqual(self.client.patch(f'{URL}{pickup.id}/', {'full_name': 'X'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'{URL}{pickup.id}/').status_code, 404)
        pickup.refresh_from_db()
        self.assertTrue(pickup.is_active)
        self.assertEqual(pickup.full_name, 'Foreign Person')

    def test_class_teacher_own_class_only(self):
        self.assertEqual(self.post(self.teacher_a).status_code, 201)
        self.assertEqual(self.post(self.teacher_a, pupil=self.pupil_b).status_code, 404)
        self.client.force_authenticate(self.teacher_b)
        self.assertEqual(self.client.get(URL, {'student': str(self.pupil_a.id)}).status_code, 404)
        self.assertEqual(self.client.get(URL).data, [])

    def test_other_roles_forbidden(self):
        self.client.force_authenticate(self.bursar)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.post(self.bursar).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_parent_reads_own_child_only_and_cannot_write(self):
        pickup = AuthorizedPickup.objects.create(
            school=self.school, student=self.pupil_a, full_name='Driver Joe', relationship='driver')
        self.client.force_authenticate(self.parent)
        rows = self.client.get(URL, {'student': str(self.pupil_a.id)}).data
        self.assertEqual([x['full_name'] for x in rows], ['Driver Joe'])
        self.assertEqual(self.client.post(URL, self.payload(), format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'{URL}{pickup.id}/', {'full_name': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{pickup.id}/').status_code, 403)
        pickup.refresh_from_db()
        self.assertTrue(pickup.is_active)
        self.assertEqual(pickup.full_name, 'Driver Joe')
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(URL, {'student': str(self.pupil_a.id)}).status_code, 404)
        self.assertEqual(self.client.get(URL).data, [])

    def test_limit_of_ten_active(self):
        for i in range(MAX_ACTIVE_PER_CHILD):
            self.assertEqual(self.post(self.admin, full_name=f'Person {i}').status_code, 201)
        self.assertEqual(self.post(self.admin, full_name='Eleventh').status_code, 400)
        # another child is unaffected; removing one frees a slot
        self.assertEqual(self.post(self.admin, pupil=self.pupil_b).status_code, 201)
        first = AuthorizedPickup.objects.filter(student=self.pupil_a).first()
        self.assertEqual(self.client.delete(f'{URL}{first.id}/').status_code, 204)
        self.assertEqual(self.post(self.admin, full_name='Eleventh').status_code, 201)

    def test_patch_and_soft_delete(self):
        pickup_id = self.post(self.admin).data['id']
        r = self.client.patch(f'{URL}{pickup_id}/', {'phone': '+237 677 00 11 22', 'student': str(self.pupil_b.id)},
                              format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['phone'], '237677001122')
        self.assertEqual(r.data['student'], str(self.pupil_a.id))  # cannot be moved to another child
        self.assertEqual(self.client.delete(f'{URL}{pickup_id}/').status_code, 204)
        row = AuthorizedPickup.objects.get(id=pickup_id)
        self.assertFalse(row.is_active)
        self.assertEqual(self.client.get(URL, {'student': str(self.pupil_a.id)}).data, [])
        self.assertEqual(self.client.patch(f'{URL}{pickup_id}/', {'full_name': 'Z'}, format='json').status_code, 404)

    def test_phone_normaliser(self):
        self.assertEqual(normalize_pickup_phone('0023765011 2233'), '237650112233')
        self.assertEqual(normalize_pickup_phone(''), '')
