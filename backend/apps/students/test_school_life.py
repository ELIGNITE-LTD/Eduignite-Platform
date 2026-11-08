"""Basic Education school life: health records and certificates.

Access matrix, institution isolation, basic-only gating and loginless pupils.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.models import ClassTeacherAssignment, School, SchoolClass
from apps.students.models import ParentStudentLink, Student

User = get_user_model()

HEALTH = '/api/v1/students/health-profiles/'
ENTRIES = '/api/v1/students/health-entries/'
CERTS = '/api/v1/students/certificates/'


def make_school(sid, category='basic'):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='Principal', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', education_category=category,
    )


def make_user(matricule, role, school, **extra):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.org', role=role,
        school=school, password='password123', is_license_paid=True, **extra,
    )


def make_pupil(school, klass, name, adm):
    # Loginless pupil: no User row at all.
    return Student.objects.create(
        school=school, school_class=klass, name=name, matricule=f'M-{adm}',
        admission_number=adm, student_class=klass.name,
    )


class SchoolLifeBase(APITestCase):
    def setUp(self):
        self.school = make_school('SL-ONE')
        self.other = make_school('SL-TWO')
        self.sec = make_school('SL-SEC', 'secondary')
        self.class_a = SchoolClass.objects.create(school=self.school, name='Class 1')
        self.class_b = SchoolClass.objects.create(school=self.school, name='Class 2')
        self.other_class = SchoolClass.objects.create(school=self.other, name='Class 1')
        self.sec_class = SchoolClass.objects.create(school=self.sec, name='Form 1')

        self.admin = make_user('ADM-SL1', 'SCHOOL_ADMIN', self.school)
        self.other_admin = make_user('ADM-SL2', 'SCHOOL_ADMIN', self.other)
        self.sec_admin = make_user('ADM-SL3', 'SCHOOL_ADMIN', self.sec)
        self.teacher_a = make_user('TCH-SLA', 'TEACHER', self.school)
        self.teacher_b = make_user('TCH-SLB', 'TEACHER', self.school)
        self.bursar = make_user('BUR-SL1', 'BURSAR', self.school)
        self.librarian = make_user('LIB-SL1', 'LIBRARIAN', self.school)
        ClassTeacherAssignment.objects.create(school_class=self.class_a, teacher=self.teacher_a)
        ClassTeacherAssignment.objects.create(school_class=self.class_b, teacher=self.teacher_b)

        self.pupil_a = make_pupil(self.school, self.class_a, 'Ada Nkeng', 'A1')
        self.pupil_b = make_pupil(self.school, self.class_b, 'Bob Tabi', 'B1')
        self.pupil_other = make_pupil(self.other, self.other_class, 'Zed Foreign', 'Z1')
        self.pupil_sec = make_pupil(self.sec, self.sec_class, 'Sec Pupil', 'S1')

        self.parent = make_user('PAR-SL1', 'PARENT', self.school)
        ParentStudentLink.objects.create(parent=self.parent, student=self.pupil_a, relationship='mother')
        self.stranger_parent = make_user('PAR-SL2', 'PARENT', self.school)
        ParentStudentLink.objects.create(parent=self.stranger_parent, student=self.pupil_b, relationship='father')

        self.sheet = {'blood_group': 'O+', 'allergies': 'Peanuts', 'emergency_contact_name': 'Mama Ada',
                      'emergency_contact_phone': '237650111222'}

    def put_health(self, user, pupil, data=None):
        self.client.force_authenticate(user)
        return self.client.put(f'{HEALTH}{pupil.id}/', data or self.sheet, format='json')


class HealthAccessTests(SchoolLifeBase):
    def test_admin_writes_and_reads_loginless_pupil(self):
        r = self.put_health(self.admin, self.pupil_a)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['student_name'], 'Ada Nkeng')
        self.assertEqual(r.data['allergies'], 'Peanuts')
        r = self.client.get(f'{HEALTH}{self.pupil_a.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['has_record'])

    def test_list_returns_row_per_pupil_even_without_record(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get(HEALTH)
        names = {row['student_name']: row['has_record'] for row in r.data}
        self.assertEqual(names, {'Ada Nkeng': False, 'Bob Tabi': False})

    def test_class_teacher_own_class_only(self):
        self.assertEqual(self.put_health(self.teacher_a, self.pupil_a).status_code, 200)
        # other class in the same school: not visible, not writable
        self.assertEqual(self.put_health(self.teacher_a, self.pupil_b).status_code, 404)
        self.assertEqual(self.client.get(f'{HEALTH}{self.pupil_b.id}/').status_code, 404)
        rows = self.client.get(HEALTH).data
        self.assertEqual([r['student_name'] for r in rows], ['Ada Nkeng'])

    def test_teacher_without_class_sees_nothing(self):
        loose = make_user('TCH-SLC', 'TEACHER', self.school)
        self.client.force_authenticate(loose)
        self.assertEqual(self.client.get(HEALTH).data, [])
        self.assertEqual(self.put_health(loose, self.pupil_a).status_code, 404)

    def test_parent_reads_own_child_only_and_cannot_write(self):
        self.put_health(self.admin, self.pupil_a)
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.get(f'{HEALTH}{self.pupil_a.id}/').status_code, 200)
        self.assertEqual(self.client.get(f'{HEALTH}{self.pupil_b.id}/').status_code, 404)
        self.assertEqual([r['student_name'] for r in self.client.get(HEALTH).data], ['Ada Nkeng'])
        self.assertEqual(self.client.put(f'{HEALTH}{self.pupil_a.id}/', self.sheet, format='json').status_code, 403)
        r = self.client.post(ENTRIES, {'student': str(self.pupil_a.id), 'entry_date': '2026-10-01',
                                       'kind': 'illness', 'note': 'x'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_other_roles_are_refused(self):
        self.put_health(self.admin, self.pupil_a)
        for user in (self.bursar, self.librarian):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(HEALTH).status_code, 403, user.role)
            self.assertEqual(self.client.get(f'{HEALTH}{self.pupil_a.id}/').status_code, 403, user.role)
            self.assertEqual(self.client.get(ENTRIES).status_code, 403, user.role)
            self.assertEqual(self.client.get(CERTS).status_code, 403, user.role)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(HEALTH).status_code, 401)

    def test_student_role_refused(self):
        stu = make_user('STU-SL1', 'STUDENT', self.school)
        self.client.force_authenticate(stu)
        self.assertEqual(self.client.get(HEALTH).status_code, 403)

    def test_school_isolation(self):
        self.put_health(self.admin, self.pupil_a)
        self.assertEqual(self.put_health(self.other_admin, self.pupil_a).status_code, 404)
        self.assertEqual(self.client.get(f'{HEALTH}{self.pupil_a.id}/').status_code, 404)
        self.assertEqual(self.put_health(self.admin, self.pupil_other).status_code, 404)
        rows = self.client.force_authenticate(self.other_admin) or self.client.get(HEALTH).data
        self.assertEqual([r['student_name'] for r in rows], ['Zed Foreign'])

    def test_secondary_school_is_not_served(self):
        self.assertEqual(self.put_health(self.sec_admin, self.pupil_sec).status_code, 404)
        self.client.force_authenticate(self.sec_admin)
        self.assertEqual(self.client.get(HEALTH).data, [])
        r = self.client.post(CERTS, {'student': str(self.pupil_sec.id), 'kind': 'merit'}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_malformed_student_id(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f'{HEALTH}not-a-uuid/').status_code, 404)


class HealthEntryTests(SchoolLifeBase):
    def entry(self, pupil, **kw):
        body = {'student': str(pupil.id), 'entry_date': '2026-10-01', 'kind': 'illness', 'note': 'Malaria, sent home'}
        body.update(kw)
        return self.client.post(ENTRIES, body, format='json')

    def test_teacher_adds_for_own_class_not_others(self):
        self.client.force_authenticate(self.teacher_a)
        r = self.entry(self.pupil_a)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['student_name'], 'Ada Nkeng')
        self.assertEqual(self.entry(self.pupil_b).status_code, 404)

    def test_visibility_and_delete(self):
        self.client.force_authenticate(self.admin)
        eid = self.entry(self.pupil_a).data['id']
        self.entry(self.pupil_b)
        self.client.force_authenticate(self.teacher_b)
        self.assertEqual(len(self.client.get(ENTRIES).data), 1)
        self.assertEqual(self.client.delete(f'{ENTRIES}{eid}/').status_code, 404)
        self.client.force_authenticate(self.parent)
        self.assertEqual(len(self.client.get(ENTRIES).data), 1)
        self.assertEqual(self.client.delete(f'{ENTRIES}{eid}/').status_code, 403)
        self.client.force_authenticate(self.stranger_parent)
        self.assertEqual([str(e['student']) for e in self.client.get(ENTRIES).data], [str(self.pupil_b.id)])
        self.client.force_authenticate(self.other_admin)
        self.assertEqual(self.client.get(ENTRIES).data, [])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'{ENTRIES}{eid}/').status_code, 204)


class CertificateTests(SchoolLifeBase):
    def issue(self, user, pupil, **kw):
        self.client.force_authenticate(user)
        body = {'student': str(pupil.id), 'kind': 'merit', 'remark': 'Top of the class',
                'issued_on': '2026-07-01', 'academic_year': '2025-2026'}
        body.update(kw)
        return self.client.post(CERTS, body, format='json')

    def test_issue_numbers_sequential_per_school(self):
        a = self.issue(self.admin, self.pupil_a)
        b = self.issue(self.admin, self.pupil_b, kind='attendance')
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual((a.data['number'], b.data['number']), ('CERT-2026-00001', 'CERT-2026-00002'))
        self.assertEqual(a.data['student_name'], 'Ada Nkeng')
        self.assertEqual(a.data['kind_label'], 'Merit')
        other = self.issue(self.other_admin, self.pupil_other)
        self.assertEqual(other.data['number'], 'CERT-2026-00001')  # separate sequence per school

    def test_teacher_scope(self):
        self.assertEqual(self.issue(self.teacher_a, self.pupil_a).status_code, 201)
        self.assertEqual(self.issue(self.teacher_a, self.pupil_b).status_code, 404)
        self.issue(self.admin, self.pupil_b)
        self.client.force_authenticate(self.teacher_a)
        self.assertEqual(len(self.client.get(CERTS).data), 1)

    def test_parent_reads_only_own_child_and_cannot_issue_or_delete(self):
        cid = self.issue(self.admin, self.pupil_a).data['id']
        other_id = self.issue(self.admin, self.pupil_b).data['id']
        self.client.force_authenticate(self.parent)
        self.assertEqual([c['id'] for c in self.client.get(CERTS).data], [cid])
        self.assertEqual(self.client.get(f'{CERTS}{other_id}/').status_code, 404)
        self.assertEqual(self.client.delete(f'{CERTS}{cid}/').status_code, 403)
        self.assertEqual(self.issue(self.parent, self.pupil_a).status_code, 403)

    def test_isolation_and_invalid_kind(self):
        cid = self.issue(self.admin, self.pupil_a).data['id']
        self.client.force_authenticate(self.other_admin)
        self.assertEqual(self.client.get(f'{CERTS}{cid}/').status_code, 404)
        self.assertEqual(self.client.delete(f'{CERTS}{cid}/').status_code, 404)
        self.assertEqual(self.issue(self.other_admin, self.pupil_a).status_code, 404)
        self.assertEqual(self.issue(self.admin, self.pupil_a, kind='bogus').status_code, 400)

    def test_admin_deletes(self):
        cid = self.issue(self.admin, self.pupil_a).data['id']
        self.assertEqual(self.client.delete(f'{CERTS}{cid}/').status_code, 204)
