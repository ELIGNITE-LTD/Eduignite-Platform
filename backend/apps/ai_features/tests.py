from unittest.mock import patch
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.assignments.models import Assignment
from apps.ai_features.models import AIExamDraft, AIExamQuestion, AIRequest
from apps.grades.models import Subject
from apps.schools.models import School, SchoolClass
from apps.users.models import User


class AIExamDraftAPITests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='AI-TST',
            name='AI Test Secondary School',
            short_name='AITSS',
            principal='Principal',
            location='Douala',
            email='ai-test@example.com',
            status='Active',
        )
        self.teacher = User.objects.create_user(
            matricule='TCH-AI-001',
            name='Teacher User',
            email='teacher.ai@example.com',
            role='TEACHER',
            password='password123',
            school=self.school,
        )
        self.student_user = User.objects.create_user(
            matricule='STD-AI-001',
            name='Student User',
            email='student.ai@example.com',
            role='STUDENT',
            password='password123',
            school=self.school,
        )
        self.executive_user = User.objects.create_user(
            matricule='EDUCEO2601',
            name='Executive User',
            email='executive.ai@example.com',
            role='CEO',
            password='password123',
        )
        self.subject = Subject.objects.create(
            school=self.school,
            name='Mathematics',
            code='MATH-AI',
            level='Form 4',
        )
        self.school_class = SchoolClass.objects.create(
            school=self.school,
            name='Form 4A',
        )

    @patch('apps.ai_features.exam_generation.call_groq_api')
    def test_teacher_can_create_ai_exam_draft(self, mocked_groq):
        mocked_groq.return_value = {
            'success': True,
            'response': '{"questions":[{"order":1,"kind":"MCQ","text":"What is 2 + 2?","options":["4","5","6","7"],"correct_option":0,"explanation":"2 + 2 equals 4.","marks":1}]}',
            'tokens_used': 10,
            'processing_time_ms': 50,
        }
        self.client.force_authenticate(self.teacher)
        response = self.client.post('/api/v1/ai/exam-drafts/', {
            'title': 'Sequence 1 Mathematics',
            'subject_id': str(self.subject.id),
            'school_class_id': str(self.school_class.id),
            'topics': 'Algebra, Geometry',
            'difficulty': 'medium',
            'exam_mode': 'ONLINE',
            'question_type': 'MCQ',
            'num_mcq': 10,
            'num_structural': 0,
            'duration_minutes': 60,
            'instructions': 'Answer all questions.',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AIExamDraft.objects.count(), 1)
        self.assertEqual(AIExamQuestion.objects.count(), 10)
        self.assertEqual(AIRequest.objects.filter(request_type='ai_exam_generation').count(), 1)
        mocked_groq.assert_called_once()

    def test_student_cannot_create_ai_exam_draft(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.post('/api/v1/ai/exam-drafts/', {
            'title': 'Not Allowed',
            'difficulty': 'medium',
            'exam_mode': 'ONLINE',
            'question_type': 'MCQ',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_executive_cannot_create_ai_exam_draft(self):
        self.client.force_authenticate(self.executive_user)
        response = self.client.post('/api/v1/ai/exam-drafts/', {
            'title': 'Executive Not Allowed',
            'subject_id': str(self.subject.id),
            'school_class_id': str(self.school_class.id),
            'difficulty': 'medium',
            'exam_mode': 'ONLINE',
            'question_type': 'MCQ',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_can_publish_reviewed_ai_draft_as_assignment(self):
        draft = AIExamDraft.objects.create(
            school=self.school,
            created_by=self.teacher,
            subject=self.subject,
            school_class=self.school_class,
            title='AI Assignment',
            publish_target=AIExamDraft.PublishTarget.ASSIGNMENT,
            exam_mode=AIExamDraft.ExamMode.ONLINE,
            question_type=AIExamDraft.QuestionType.MCQ,
            assignment_due_date=timezone.now() + timedelta(days=3),
            status=AIExamDraft.Status.REVIEWED,
            reviewed_by=self.teacher,
            reviewed_at=timezone.now(),
        )
        AIExamQuestion.objects.create(
            draft=draft,
            order=1,
            kind=AIExamQuestion.QuestionKind.MCQ,
            text='What is 2 + 2?',
            options=['4', '5', '6', '7'],
            correct_option=0,
            marks=5,
        )

        self.client.force_authenticate(self.teacher)
        response = self.client.post(f'/api/v1/ai/exam-drafts/{draft.id}/publish/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Assignment.objects.count(), 1)
        assignment = Assignment.objects.get()
        self.assertEqual(assignment.teacher, self.teacher)
        self.assertEqual(assignment.school_class, self.school_class)
        self.assertEqual(assignment.status, Assignment.Status.PUBLISHED)
