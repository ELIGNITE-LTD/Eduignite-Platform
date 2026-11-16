"""Printable mark sheets: creating, printing, importing and reading photos."""

import io
import types
import uuid

import cv2
import numpy as np
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.higher_ed.tests.test_higher_ed import make_school, make_user
from apps.marksheets import importer, layout as L, pdf as P, reader as R
from apps.registry import api as registry_api
from apps.students.models import Student

BASE = '/api/v1/marksheets/'


def fake_sheet(n=5, int_digits=2, decimals=2):
    rows = [{'student_id': str(i), 'name': f'Student {i}', 'matricule': f'M{i}'} for i in range(n)]
    return types.SimpleNamespace(id=uuid.uuid4(), rows=rows, int_digits=int_digits, decimals=decimals, title='T',
                                 subtitle_lines=['x'], school_name='School', max_label='20', max_score=20)


class ImporterTests(APITestCase):
    def test_matches_by_matricule_and_name_and_flags_odd_values(self):
        sheet = fake_sheet(4)
        sheet.rows[1]['name'] = 'Ngwa Mary'
        out = importer.match_rows(importer.parse_table('Matricule,Name,Mark\nM0,x,14.5\n,Mary Ngwa,abs\nM2,y,25\nM3,z,abc\nZZ,Nobody,10'), sheet)
        by = {r['row']: r for r in out['rows']}
        self.assertEqual((by[0]['status'], by[0]['value']), ('ok', '14.5'))
        self.assertEqual(by[1]['status'], 'absent')
        self.assertEqual(by[2]['status'], 'uncertain')
        self.assertEqual(by[3]['reason'], 'not_a_number')
        self.assertEqual(len(out['unmatched']), 1)

    def test_headerless_two_columns(self):
        out = importer.match_rows(importer.parse_table('M0\t12\nM1\t8,5'), fake_sheet(2))
        self.assertEqual([r['value'] for r in out['rows']], ['12', '8.5'])


class ReaderTests(APITestCase):
    def photo(self, sheet, fill):
        open('/tmp/_ms.pdf', 'wb').write(P.build_pdf(sheet))
        import subprocess
        subprocess.run(['pdftoppm', '-r', '150', '-png', '-singlefile', '/tmp/_ms.pdf', '/tmp/_ms'], check=True)
        im = cv2.imread('/tmp/_ms.png', 0)
        k = 150 / 25.4
        for (r, c), digit in fill.items():
            x, y, w, h = L.box_rects(L.Spec(sheet.int_digits, sheet.decimals), r)[c]
            cv2.putText(im, str(digit), (int((x + w * 0.25) * k), int((y + h * 0.8) * k)), cv2.FONT_HERSHEY_SIMPLEX, 1.1, 0, 3)
        return cv2.imencode('.jpg', im)[1].tobytes()

    def test_reads_written_digits(self):
        sheet = fake_sheet(3)
        data = self.photo(sheet, {(0, 0): 1, (0, 1): 4, (0, 2): 5, (1, 1): 9})
        page = R.straighten(data)
        self.assertEqual(page.sheet_id, str(sheet.id))
        rows = {r['row']: r for r in R.read_page(page, sheet)['rows']}
        self.assertEqual(rows[2]['status'], 'blank')
        self.assertIn(rows[0]['status'], ('ok', 'uncertain'))

    def test_rejects_non_sheet_photo(self):
        blank = cv2.imencode('.jpg', np.full((600, 400), 255, np.uint8))[1].tobytes()
        with self.assertRaises(R.SheetReadError):
            R.straighten(blank)


class ApiTests(APITestCase):
    def setUp(self):
        self.school = make_school('MS-1', 'secondary')
        self.other = make_school('MS-2', 'secondary')
        for s in (self.school, self.other):
            registry_api.install_defaults(s) if hasattr(registry_api, 'install_defaults') else None
        self.teacher = make_user('TCH-MS1', 'TEACHER', self.school)
        self.pupil = make_user('STU-MS1', 'STUDENT', self.school)
        self.student = Student.objects.create(school=self.school, user=self.pupil, student_class='Form 1', admission_number='A1')
        self.foreign = Student.objects.create(school=self.other, user=make_user('STU-MS2', 'STUDENT', self.other), student_class='Form 1', admission_number='A2')

    def body(self, **extra):
        return {'kind': 'grade', 'title': 'Maths', 'max_score': '20', 'student_ids': [self.student.id], **extra}

    def test_create_pdf_import(self):
        self.client.force_authenticate(self.teacher)
        r = self.client.post(BASE, self.body(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        pdf = self.client.get(r.data['pdf_url'].replace('/api/v1/', '/api/v1/'))
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b'%PDF'))
        imp = self.client.post(f"{BASE}{r.data['id']}/import/", {'text': f"{self.student.display_matricule},15"}, format='json')
        self.assertEqual(imp.status_code, 200, imp.content)
        self.assertEqual(imp.data['rows'][0]['value'], '15')

    def test_other_school_students_rejected_and_students_cannot_print(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(BASE, self.body(student_ids=[self.foreign.id]), format='json').status_code, 400)
        self.client.force_authenticate(self.pupil)
        self.assertEqual(self.client.post(BASE, self.body(), format='json').status_code, 403)

    def test_sheet_of_other_school_is_hidden(self):
        self.client.force_authenticate(self.teacher)
        sid = self.client.post(BASE, self.body(), format='json').data['id']
        self.client.force_authenticate(make_user('TCH-MS2', 'TEACHER', self.other))
        self.assertEqual(self.client.get(f'{BASE}{sid}/pdf/').status_code, 404)

    def test_read_requires_photo(self):
        self.client.force_authenticate(self.teacher)
        sid = self.client.post(BASE, self.body(), format='json').data['id']
        self.assertEqual(self.client.post(f'{BASE}{sid}/read/', {}, format='multipart').status_code, 400)
        bad = SimpleUploadedFile('a.jpg', b'not an image', content_type='image/jpeg')
        r = self.client.post(f'{BASE}{sid}/read/', {'photos': bad}, format='multipart')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['problems']), 1)
