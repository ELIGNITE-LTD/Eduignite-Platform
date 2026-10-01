"""A whole paper in one go: read, every question solved in full, one answer."""

import json
import threading
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.ai_features import paper as papers
from apps.ai_features.credit_models import AIUsageRecord
from apps.ai_features.tests_credits import CHAT_URL, MODEL, CreditTestMixin, enable_billing, photo_data_url

PAPER_JSON = {
    'title': 'A-Level Physics - Intensive Problem Set',
    'instructions': 'g = 9.81 m/s^2, answers to 3 s.f.',
    'questions': [
        {'number': 'Question 1', 'title': 'Projectile on an Incline', 'text': 'A ball is launched at 24 m/s ...', 'figure': ''},
        {'number': '2', 'title': 'Variable Acceleration', 'text': 'A sled starts from rest ...', 'figure': ''},
        {'number': '3', 'title': '', 'text': 'A 470 uF capacitor ...', 'figure': 'A series RC circuit with a switch.'},
    ],
}


def completion(text, *, finish='stop', input_tokens=2000, output_tokens=1500):
    result = MagicMock()
    choice = MagicMock()
    choice.message.content = text
    choice.finish_reason = finish
    result.choices = [choice]
    result.usage.prompt_tokens = input_tokens
    result.usage.completion_tokens = output_tokens
    result.usage.total_tokens = input_tokens + output_tokens
    result.usage.prompt_tokens_details.cached_tokens = 0
    return result


class FakeGroq:
    """Answers the reader with the paper, and each question with its own solution."""

    def __init__(self, paper=PAPER_JSON, *, cut_off=(), fail=()):
        self.paper = paper
        self.cut_off = set(cut_off)
        self.fail = set(fail)
        self.calls = []
        self.lock = threading.Lock()

    def __call__(self, **kwargs):
        with self.lock:
            self.calls.append(kwargs)
        if kwargs.get('response_format'):
            return completion(json.dumps(self.paper), input_tokens=1400, output_tokens=500)
        content = kwargs['messages'][1]['content']
        number = next(q['number'] for q in self.paper['questions'] if f"{q['text']}" in content)
        if number in self.fail:
            raise RuntimeError('Error code: 500 - boom')
        if len(kwargs['messages']) > 2:  # a continuation
            return completion(' and the rest. **Answers:** done')
        if number in self.cut_off:
            return completion(f'Solution of {number}, part one', finish='length')
        return completion(f'### (a) Working\n\nSolution of {number}.\n\n**Answers:** {number} done')


@override_settings(GROQ_API_KEY='key-a', GROQ_FAST_API_KEY='key-b', GROQ_EXAM_API_KEY='key-b', GROQ_CAREER_API_KEY='',
                   GROQ_MODEL=MODEL, AI_PAPER_MODE=True)
class PaperSolvingTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def solve(self, fake, message='', images=('data:image/png;base64,AAAA',)):
        with patch('groq.Groq') as groq:
            groq.return_value.chat.completions.create.side_effect = fake
            groq.side_effect = lambda **kw: self._client(groq, kw)
            paper = papers.read_paper(message, list(images))
            reply = papers.solve_paper(paper)
        return paper, reply

    def _client(self, groq, kwargs):
        self.keys_used.append(kwargs['api_key'])
        return groq.return_value

    keys_used: list

    def test_every_question_is_solved_in_order_under_the_paper_title(self):
        self.keys_used = []
        paper, reply = self.solve(FakeGroq())

        self.assertEqual(paper.solved, 3)
        self.assertTrue(reply.startswith('# A-Level Physics - Intensive Problem Set'))
        positions = [reply.index(f'Solution of {n}') for n in ('Question 1', '2', '3')]
        self.assertEqual(positions, sorted(positions))
        self.assertIn('## Question 1 - Projectile on an Incline', reply)
        self.assertIn('## Question 2 - Variable Acceleration', reply)
        self.assertIn('## Question 3', reply)
        self.assertIn('*Figure: A series RC circuit with a switch.*', reply)

    def test_the_questions_are_spread_over_every_key(self):
        self.keys_used = []
        self.solve(FakeGroq())
        self.assertEqual(set(self.keys_used), {'key-a', 'key-b'})

    def test_each_question_is_solved_in_exam_mode_with_room_to_finish(self):
        self.keys_used = []
        fake = FakeGroq()
        self.solve(fake)

        solving = [call for call in fake.calls if not call.get('response_format')]
        self.assertEqual(len(solving), 3)
        for call in solving:
            self.assertEqual(call['model'], MODEL)
            self.assertGreaterEqual(call['max_tokens'], 8000)
            self.assertIn('EXAM MODE', call['messages'][1]['content'])
            self.assertIn('MUST draw it', call['messages'][1]['content'])
            self.assertEqual(call['extra_body']['reasoning_effort'], 'medium')

    def test_an_answer_cut_off_by_the_token_limit_is_continued(self):
        self.keys_used = []
        fake = FakeGroq(cut_off={'2'})
        paper, reply = self.solve(fake)

        self.assertIn('Solution of 2, part one and the rest.', reply)
        continuation = [call for call in fake.calls if len(call['messages']) > 2]
        self.assertEqual(len(continuation), 1)
        self.assertEqual(continuation[0]['messages'][2], {'role': 'assistant', 'content': 'Solution of 2, part one'})

    def test_one_failed_question_does_not_sink_the_paper(self):
        self.keys_used = []
        paper, reply = self.solve(FakeGroq(fail={'2'}))

        self.assertEqual(paper.solved, 2)
        self.assertEqual(paper.failed, ['Question 2 - Variable Acceleration'])
        self.assertIn('could not be solved just now', reply)

    def test_the_same_photos_are_read_only_once(self):
        self.keys_used = []
        fake = FakeGroq()
        self.solve(fake)
        self.solve(fake)
        self.assertEqual(sum(1 for call in fake.calls if call.get('response_format')), 1)

    def test_one_line_of_text_is_never_treated_as_a_paper(self):
        self.assertFalse(papers.looks_like_paper('what is physics'))
        self.assertIsNone(papers.read_paper('what is physics'))

    def test_a_pasted_problem_set_is_recognised(self):
        text = ('Question 1: A ball is launched at 24 m/s from the base of an incline. ' * 3
                + '\nQuestion 2: A sled starts from rest with acceleration 6 - 0.5t. ' * 3)
        self.assertTrue(papers.looks_like_paper(text))


@override_settings(GROQ_API_KEY='key-a', GROQ_FAST_API_KEY='', GROQ_EXAM_API_KEY='', GROQ_CAREER_API_KEY='',
                   GROQ_MODEL=MODEL, GROQ_VISION_MODEL='qwen/qwen3.8-27b',
                   AI_PAPER_MODE=True, AI_CHAT_MAX_IMAGES=3)
class PaperChatTests(CreditTestMixin, TestCase):
    """Through the app's chat: one answer, one charge for all of it."""

    def setUp(self):
        cache.clear()
        enable_billing()
        self.student = self.make_user('CRD-PAPER-1')
        self.set_balance(self.student, purchased=1000)  # a whole paper costs more than a day's free credits
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def tearDown(self):
        patch.stopall()

    def test_a_photo_of_a_paper_is_answered_whole_and_charged_once(self):
        groq = patch('groq.Groq').start()
        groq.return_value.chat.completions.create.side_effect = FakeGroq()

        response = self.api.post(CHAT_URL, {'images': [photo_data_url()]}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        reply = response.data['reply']
        for number in ('Question 1', '2', '3'):
            self.assertIn(f'Solution of {number}', reply)
        usage = AIUsageRecord.objects.get(user=self.student)
        self.assertEqual(usage.feature, 'image_question')
        self.assertEqual(usage.provider_calls, 4)  # reading + three questions
        self.assertEqual(usage.status, AIUsageRecord.COMPLETED)
        self.assertGreater(usage.charged_credits, 0)

    def test_a_single_question_photo_is_answered_as_before(self):
        one = dict(PAPER_JSON, questions=PAPER_JSON['questions'][:1])
        fake = FakeGroq(paper=one)
        groq = patch('groq.Groq').start()
        create = groq.return_value.chat.completions.create

        def answer(**kwargs):
            if kwargs.get('response_format'):
                return fake(**kwargs)
            return completion('The answer is 12.')

        create.side_effect = answer
        response = self.api.post(CHAT_URL, {'message': 'Q4', 'images': [photo_data_url()]}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['reply'], 'The answer is 12.')
        self.assertEqual(create.call_args.kwargs['model'], 'qwen/qwen3.8-27b')
