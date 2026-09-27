"""Tests for EduIgnite Offline licensing/QR activation, chunked sync, and
offline-to-cloud migration.

Follows the same conventions used elsewhere in this backend (see
``apps/app_store/tests/test_app_store.py``): plain ``django.test.TestCase`` +
DRF's ``APIClient`` with ``force_authenticate``, no factory_boy fixtures.

The signing key is overridden per-class with a throwaway ECDSA P-256 keypair
(NOT the one in ``.env.example``) so these tests never depend on env/`.env`
configuration.
"""

import hashlib
import json
import uuid
from datetime import timedelta

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.offline_licensing import crypto
from apps.offline_licensing.models import (
    DeviceRegistration,
    LicenseIssuance,
    MigrationJob,
    QRChallenge,
    SyncChunk,
    SyncSession,
)
from apps.schools.models import School
# Through the students API, like the code under test.
from apps.students import api as students_api

User = get_user_model()


def _iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _generate_test_keypair():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('ascii')
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')
    return private_pem, public_pem


TEST_PRIVATE_KEY_PEM, TEST_PUBLIC_KEY_PEM = _generate_test_keypair()


@override_settings(SECURE_SSL_REDIRECT=False, OFFLINE_LICENSING_PRIVATE_KEY_PEM=TEST_PRIVATE_KEY_PEM)
class QRChallengeRedemptionTests(TestCase):
    """POST /api/v1/offline-licensing/challenges/redeem/"""

    def setUp(self):
        self.school = School.objects.create(
            id='SCH-QR1',
            name='QR Test Secondary School',
            short_name='QRTS',
            principal='Principal QR',
            location='Buea',
            email='qrschool@example.com',
            phone='237654000001',
        )
        self.technician = User.objects.create_user(
            matricule='SCH-QR1-ADM',
            name='QR Technician',
            email='qrtech@example.com',
            role='SCHOOL_ADMIN',
            password='pass12345',
            school=self.school,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.technician)

    def _challenge_payload(self, *, expires_delta=timedelta(minutes=5), purpose='activation', **overrides):
        now = timezone.now()
        payload = {
            'challengeId': str(uuid.uuid4()),
            'schoolId': self.school.id,
            'deviceId': 'HW-AAAA-1111',
            'purpose': purpose,
            'nonce': 'a' * 32,
            'createdAt': _iso(now),
            'expiresAt': _iso(now + expires_delta),
        }
        payload.update(overrides)
        return payload

    def test_valid_challenge_redemption_issues_correctly_signed_certificate(self):
        payload = self._challenge_payload()

        response = self.client.post(
            '/api/v1/offline-licensing/challenges/redeem/', payload, format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        certificate = response.data['certificate']
        cert_payload = certificate['payload']

        self.assertEqual(cert_payload['schoolId'], self.school.id)
        self.assertEqual(cert_payload['deviceId'], payload['deviceId'])
        self.assertEqual(cert_payload['plan'], 'first_year_free')

        # Signature must verify against the (test) public key, over the exact
        # canonical-JSON bytes the wire contract specifies.
        self.assertTrue(
            crypto.verify_signature(
                cert_payload, certificate['signature'], public_key_pem=TEST_PUBLIC_KEY_PEM,
            )
        )
        # Canonical JSON: sorted keys, no whitespace.
        expected_bytes = json.dumps(cert_payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
        self.assertEqual(crypto.canonical_json_bytes(cert_payload), expected_bytes)

        self.assertEqual(LicenseIssuance.objects.count(), 1)
        self.assertTrue(DeviceRegistration.objects.filter(school=self.school, device_id=payload['deviceId']).exists())
        challenge = QRChallenge.objects.get(challenge_id=payload['challengeId'])
        self.assertIsNotNone(challenge.used_at)

    def test_expired_challenge_rejected(self):
        payload = self._challenge_payload(expires_delta=timedelta(minutes=-5))

        response = self.client.post(
            '/api/v1/offline-licensing/challenges/redeem/', payload, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(LicenseIssuance.objects.count(), 0)

    def test_replayed_challenge_id_rejected(self):
        payload = self._challenge_payload()

        first = self.client.post(
            '/api/v1/offline-licensing/challenges/redeem/', payload, format='json',
        )
        self.assertEqual(first.status_code, 201)

        second = self.client.post(
            '/api/v1/offline-licensing/challenges/redeem/', payload, format='json',
        )

        self.assertEqual(second.status_code, 409)
        # Anti-replay: exactly one issuance/challenge row, not two.
        self.assertEqual(LicenseIssuance.objects.count(), 1)
        self.assertEqual(QRChallenge.objects.filter(challenge_id=payload['challengeId']).count(), 1)


@override_settings(SECURE_SSL_REDIRECT=False, OFFLINE_LICENSING_PRIVATE_KEY_PEM=TEST_PRIVATE_KEY_PEM)
class SyncChunkTests(TestCase):
    """POST/GET under /api/v1/offline-sync/sessions/..."""

    def setUp(self):
        self.school = School.objects.create(
            id='SCH-SYNC1',
            name='Sync Test Secondary School',
            short_name='SYTS',
            principal='Principal Sync',
            location='Douala',
            email='syncschool@example.com',
            phone='237654000002',
        )
        self.technician = User.objects.create_user(
            matricule='SCH-SYNC1-ADM',
            name='Sync Technician',
            email='synctech@example.com',
            role='SCHOOL_ADMIN',
            password='pass12345',
            school=self.school,
        )
        self.device = DeviceRegistration.objects.create(school=self.school, device_id='HW-BBBB-2222')
        self.session = SyncSession.objects.create(school=self.school, device=self.device)
        self.client = APIClient()
        self.client.force_authenticate(self.technician)

    def _chunk_body(self, chunk_index, total_chunks=3):
        rows = [
            {'table': 'attendance', 'rowId': f'row-{chunk_index}', 'op': 'upsert', 'payload': {'present': True}},
        ]
        checksum = hashlib.sha256(
            json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        ).hexdigest()
        return {
            'chunkIndex': chunk_index,
            'totalChunks': total_chunks,
            'checksum': checksum,
            'rows': rows,
        }

    def _chunk_url(self, index=None):
        return f'/api/v1/offline-sync/sessions/{self.session.id}/chunks/'

    def test_duplicate_chunk_post_is_idempotent(self):
        body = self._chunk_body(0)

        first = self.client.post(self._chunk_url(), body, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data['received'], 0)

        second = self.client.post(self._chunk_url(), body, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data['received'], 0)

        self.assertEqual(SyncChunk.objects.filter(session=self.session, chunk_index=0).count(), 1)

    def test_sync_session_status_reports_correct_last_acked_chunk_after_partial_upload(self):
        status_url = f'/api/v1/offline-sync/sessions/{self.session.id}/status/'

        initial = self.client.get(status_url)
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.data['lastAckedChunkIndex'], -1)

        self.client.post(self._chunk_url(), self._chunk_body(0), format='json')
        self.client.post(self._chunk_url(), self._chunk_body(1), format='json')
        # chunk 2 intentionally skipped/not yet uploaded

        after_partial = self.client.get(status_url)
        self.assertEqual(after_partial.status_code, 200)
        self.assertEqual(after_partial.data['lastAckedChunkIndex'], 1)


@override_settings(SECURE_SSL_REDIRECT=False, OFFLINE_LICENSING_PRIVATE_KEY_PEM=TEST_PRIVATE_KEY_PEM)
class MigrationImportTests(TestCase):
    """POST /api/v1/offline-migration/import/"""

    def setUp(self):
        self.executive = User.objects.create_user(
            matricule='EXEC-MIG1',
            name='Platform Executive',
            email='exec@example.com',
            role='CEO',
            password='pass12345',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.executive)
        self.payload = {
            'schoolId': 'SCH-MIG1',
            'school': {
                'name': 'Migration Test School',
                'shortName': 'MTS',
                'principal': 'Principal Migration',
                'location': 'Yaounde',
                'email': 'migschool@example.com',
            },
            'teachers': [
                {'teacherId': 'TCH-0001', 'name': 'Teacher One', 'email': 'teacher1@example.com'},
            ],
            'students': [
                {'studentId': 'ADM-0001', 'name': 'Student One'},
            ],
        }

    def test_dry_run_reports_without_writing(self):
        response = self.client.post(
            '/api/v1/offline-migration/import/', self.payload, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['valid'])
        self.assertEqual(response.data['teachers']['toCreate'], 1)
        self.assertEqual(response.data['students']['toCreate'], 1)

        # No writes should have happened.
        self.assertFalse(School.objects.filter(id='SCH-MIG1').exists())
        self.assertFalse(User.objects.filter(matricule='TCH-0001').exists())
        self.assertIsNone(students_api.get_student_by_admission_number('ADM-0001'))
        # A dry-run job may be logged for audit, but never marked imported.
        self.assertFalse(MigrationJob.objects.filter(status=MigrationJob.Status.IMPORTED).exists())

    def test_confirm_true_writes_and_preserves_ids_exactly(self):
        confirmed_payload = dict(self.payload, confirm=True)

        response = self.client.post(
            '/api/v1/offline-migration/import/', confirmed_payload, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)

        school = School.objects.get(id='SCH-MIG1')
        self.assertEqual(school.id, 'SCH-MIG1')

        teacher = User.objects.get(matricule='TCH-0001')
        self.assertEqual(teacher.matricule, 'TCH-0001')
        self.assertEqual(teacher.role, 'TEACHER')

        student = students_api.get_student_by_admission_number('ADM-0001')
        self.assertEqual(student.admission_number, 'ADM-0001')
        self.assertEqual(student.school_id, 'SCH-MIG1')

        job = MigrationJob.objects.get(school=school)
        self.assertEqual(job.status, MigrationJob.Status.IMPORTED)

        # Re-running the same confirmed payload is idempotent (update, not duplicate).
        second = self.client.post(
            '/api/v1/offline-migration/import/', confirmed_payload, format='json',
        )
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(User.objects.filter(matricule='TCH-0001').count(), 1)
        self.assertEqual(
            students_api.list_students().filter(admission_number='ADM-0001').count(),
            1,
        )

    def test_refuses_to_reassign_a_teacher_matricule_belonging_to_another_school(self):
        """Regression test for a cross-school account-hijack bug: matricule is
        globally unique (User.USERNAME_FIELD), so a migration payload for one
        school must never be allowed to silently reassign a User row that
        already belongs to a DIFFERENT school, even though update_or_create
        would otherwise happily do exactly that.
        """
        victim_school = School.objects.create(
            id='SCH-VICTIM', name='Victim School', short_name='VS',
            principal='P', location='Bamenda', email='victim@example.com',
        )
        victim_teacher = User.objects.create_user(
            matricule='TCH-VICTIM-1', name='Victim Teacher', email='victim.teacher@example.com',
            role='TEACHER', password='pass12345', school=victim_school,
        )

        hijack_payload = dict(self.payload, confirm=True)
        hijack_payload['teachers'] = [
            {'teacherId': 'TCH-VICTIM-1', 'name': 'Attacker-Supplied Name', 'email': 'attacker@example.com'},
        ]

        response = self.client.post(
            '/api/v1/offline-migration/import/', hijack_payload, format='json',
        )

        # Must be rejected as invalid, not silently accepted.
        self.assertEqual(response.status_code, 400, response.data)

        # The victim's account must be completely untouched: still at their
        # own school, with their original name/email, not moved to SCH-MIG1.
        victim_teacher.refresh_from_db()
        self.assertEqual(victim_teacher.school_id, 'SCH-VICTIM')
        self.assertEqual(victim_teacher.name, 'Victim Teacher')
        self.assertEqual(victim_teacher.email, 'victim.teacher@example.com')
        self.assertFalse(School.objects.filter(id='SCH-MIG1').exists())

    def test_dry_run_report_also_flags_the_cross_school_matricule_collision(self):
        """The dry-run report must not lie: it should report this as an error
        (not 'toCreate'), so a caller inspecting the report before setting
        confirm:true would already see the problem.
        """
        victim_school = School.objects.create(
            id='SCH-VICTIM2', name='Victim School 2', short_name='VS2',
            principal='P', location='Bamenda', email='victim2@example.com',
        )
        User.objects.create_user(
            matricule='TCH-VICTIM-2', name='Victim Teacher 2', email='victim.teacher2@example.com',
            role='TEACHER', password='pass12345', school=victim_school,
        )

        payload = dict(self.payload)
        payload['teachers'] = [{'teacherId': 'TCH-VICTIM-2', 'name': 'Someone', 'email': 'someone@example.com'}]

        response = self.client.post(
            '/api/v1/offline-migration/import/', payload, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['teachers']['toCreate'], 0)
        teacher_row = response.data['teachers']['rows'][0]
        self.assertEqual(teacher_row['action'], 'skip')
        self.assertTrue(any('different school' in e for e in teacher_row['errors']))
