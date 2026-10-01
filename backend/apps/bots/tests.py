"""EduIgnite AI on Telegram, end to end.

Telegram and the AI provider are faked at their edges; everything between
them is the real code: the webhook, the guest accounts, the credit engine,
the formatting, the PDF rule, the purchase flow and account linking.
"""

import base64
import io
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.ai_features import credit_engine
from apps.ai_features.credit_models import AICreditConfig, AICreditTransaction, AIUsageRecord
from apps.bots import formatting
from apps.bots.handlers import normalise_phone
from apps.bots.models import BotIdentity, BotLinkCode, ProcessedUpdate
from apps.fees.models import GatewayTransaction

User = get_user_model()
WEBHOOK = '/api/v1/bots/telegram/webhook/'
SECRET = 's3cret-webhook'
TG_USER = 700100200
MODEL = 'openai/gpt-oss-120b'


def enable_billing(**fields):
    """Paying mode, as these tests describe it. AI is free by default."""
    config, _ = AICreditConfig.objects.get_or_create(pk=1)
    config.billing_enabled = True
    for key, value in fields.items():
        setattr(config, key, value)
    config.save()
    credit_engine.invalidate_config()
    return config


def completion(text='Photosynthesis turns light into chemical energy.', *, input_tokens=1000, output_tokens=1000):
    result = MagicMock()
    choice = MagicMock()
    choice.message.content = text
    choice.finish_reason = 'stop'
    result.choices = [choice]
    result.usage.prompt_tokens = input_tokens
    result.usage.completion_tokens = output_tokens
    result.usage.total_tokens = input_tokens + output_tokens
    result.usage.prompt_tokens_details.cached_tokens = 0
    return result


def png_bytes():
    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (80, 60), (10, 120, 200)).save(buffer, format='PNG')
    return buffer.getvalue()


class FakeTelegram:
    """Records every Bot API call and answers like Telegram would."""

    def __init__(self):
        self.calls = []
        self.next_id = 100

    def __call__(self, method, *, files=None, **params):
        self.calls.append((method, params, files))
        if method in ('sendMessage', 'sendDocument', 'editMessageText'):
            self.next_id += 1
            return {'message_id': self.next_id}
        if method == 'getFile':
            return {'file_path': 'photos/file_1.jpg', 'file_size': 1000}
        if method == 'getMe':
            return {'username': 'EduIgniteAIBot'}
        return True

    def sent(self, method='sendMessage'):
        return [params for name, params, _ in self.calls if name == method]

    def texts(self):
        return [params.get('text', '') for params in self.sent()]

    def last_text(self):
        return self.texts()[-1]


@override_settings(
    TELEGRAM_BOT_TOKEN='123:test', TELEGRAM_WEBHOOK_SECRET=SECRET, TELEGRAM_BOT_USERNAME='EduIgniteAIBot',
    GROQ_API_KEY='test-key', GROQ_MODEL=MODEL, GROQ_VISION_MODEL='meta-llama/llama-4-scout-17b-16e-instruct',
    CELERY_TASK_ALWAYS_EAGER=True, BOT_BROWSER_RENDERING=False,
    FAPSHI_API_USER='user', FAPSHI_API_KEY='key',
)
class TelegramBotTests(TestCase):
    def setUp(self):
        cache.clear()
        enable_billing()
        self.telegram = FakeTelegram()
        patcher = patch('apps.bots.telegram.call', side_effect=self.telegram)
        patcher.start()
        self.addCleanup(patch.stopall)
        self.update_id = 1
        self.api = APIClient()

    # --- helpers -----------------------------------------------------------

    def deliver(self, message=None, callback=None, *, user_id=TG_USER, secret=SECRET):
        self.update_id += 1
        update = {'update_id': self.update_id}
        sender = {'id': user_id, 'is_bot': False, 'first_name': 'Amina', 'last_name': 'Njoya', 'language_code': 'en'}
        if message is not None:
            update['message'] = {'message_id': self.update_id, 'chat': {'id': user_id, 'type': 'private'},
                                 'from': sender, **message}
        if callback is not None:
            update['callback_query'] = {'id': f'cb{self.update_id}', 'from': sender,
                                        'message': {'message_id': 55, 'chat': {'id': user_id}}, 'data': callback}
        return self.client.post(WEBHOOK, update, content_type='application/json',
                                HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=secret)

    def groq(self, *completions, error=None):
        mock = patch('groq.Groq').start()
        create = mock.return_value.chat.completions.create
        if error:
            create.side_effect = error
        else:
            create.side_effect = list(completions)
        return create

    def identity(self):
        return BotIdentity.objects.select_related('user').get(external_id=str(TG_USER))

    def configure(self, **fields):
        config, _ = AICreditConfig.objects.get_or_create(pk=1)
        for key, value in fields.items():
            setattr(config, key, value)
        config.save()
        enable_billing()

    # --- the webhook -------------------------------------------------------

    def test_only_telegram_can_deliver(self):
        self.assertEqual(self.deliver({'text': '/start'}, secret='wrong').status_code, 403)
        with override_settings(TELEGRAM_WEBHOOK_SECRET=''):
            self.assertEqual(self.deliver({'text': '/start'}).status_code, 403)
        self.assertFalse(BotIdentity.objects.exists())

    def test_the_same_update_delivered_twice_is_handled_once(self):
        update = {'update_id': 42, 'message': {'message_id': 1, 'chat': {'id': TG_USER, 'type': 'private'},
                                               'from': {'id': TG_USER, 'first_name': 'A'}, 'text': '/help'}}
        for _ in range(2):
            self.client.post(WEBHOOK, update, content_type='application/json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=SECRET)
        self.assertEqual(len(self.telegram.sent()), 1)
        self.assertEqual(ProcessedUpdate.objects.count(), 1)

    def test_group_chats_are_ignored(self):
        update = {'update_id': 9, 'message': {'message_id': 1, 'chat': {'id': -5, 'type': 'group'},
                                              'from': {'id': TG_USER, 'first_name': 'A'}, 'text': 'hello'}}
        self.client.post(WEBHOOK, update, content_type='application/json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=SECRET)
        self.assertFalse(BotIdentity.objects.exists())
        self.assertEqual(self.telegram.sent(), [])

    # --- guests ------------------------------------------------------------

    def test_a_newcomer_gets_a_guest_account_with_30_free_credits(self):
        self.deliver({'text': '/start'})

        identity = self.identity()
        self.assertEqual(identity.user.role, 'AI_GUEST')
        self.assertFalse(identity.user.has_usable_password())
        self.assertEqual(credit_engine.balance(identity.user)['daily_free_limit'], 30)
        self.assertIn('30 free AI credits every day', self.telegram.last_text())
        self.assertIn('/link', self.telegram.last_text())

    def test_a_question_is_answered_and_charged_to_the_chat(self):
        self.groq(completion('**Photosynthesis** turns light into energy: \\(6CO_2 + 6H_2O\\).'))

        self.deliver({'text': 'What is photosynthesis?'})

        answer = self.telegram.last_text()
        self.assertIn('<b>Photosynthesis</b>', answer)
        self.assertIn('6CO₂ + 6H₂O', answer)
        self.assertIn('6 credits · 24 left', answer)
        pdf_button = self.telegram.sent()[-1]['reply_markup']['inline_keyboard'][0][0]
        self.assertTrue(pdf_button['callback_data'].startswith('pdf:'))
        usage = AIUsageRecord.objects.get()
        self.assertEqual((usage.channel, usage.charged_credits), ('telegram', 6))
        self.assertEqual(len(self.identity().history), 2)

    def test_the_conversation_carries_on(self):
        create = self.groq(completion('First answer.'), completion('Second answer.'))
        self.deliver({'text': 'What is a cell?'})
        self.deliver({'text': 'And its nucleus?'})

        second_prompt = create.call_args_list[1].kwargs['messages'][1]['content']
        self.assertIn('What is a cell?', second_prompt)
        self.assertIn('First answer.', second_prompt)

    def test_an_answer_with_a_chart_comes_as_a_pdf(self):
        chart = 'Here are the marks.\n\n```graph\n{"type": "bar", "data": [{"label": "A", "value": 3}]}\n```\n'
        self.groq(completion(chart))
        with patch('apps.bots.rendering.answer_pdf', return_value=b'%PDF-1.4 fake') as render:
            self.deliver({'text': 'Draw a bar chart of my marks'})

        self.assertIn('The chart is drawn in the PDF below', self.telegram.last_text())
        self.assertNotIn('"type": "bar"', self.telegram.last_text())
        documents = [files for name, _, files in self.telegram.calls if name == 'sendDocument']
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0]['document'][1], b'%PDF-1.4 fake')
        self.assertIn('"type": "bar"', render.call_args.args[1])

    def test_any_answer_can_be_downloaded_as_a_pdf(self):
        self.groq(completion('A plain answer.'))
        self.deliver({'text': 'What is a verb?'})
        key = self.telegram.sent()[-1]['reply_markup']['inline_keyboard'][0][0]['callback_data']

        with patch('apps.bots.rendering.answer_pdf', return_value=b'%PDF') as render:
            self.deliver(callback=key)

        render.assert_called_once()
        self.assertEqual(render.call_args.args[:2], ('What is a verb?', 'A plain answer.'))
        self.assertEqual(len(self.telegram.sent('sendDocument')), 1)

    def test_the_plain_pdf_is_used_when_the_browser_is_not_available(self):
        from apps.bots import rendering

        with patch('apps.ai_features.pdf_utils.render_html_to_pdf', return_value=b'%PDF-plain') as plain:
            pdf = rendering.answer_pdf('Q', 'Answer with **bold**\n\n```graph\n{}\n```', chart_note='chart')
        self.assertEqual(pdf, b'%PDF-plain')
        self.assertIn('<b>bold</b>', plain.call_args.args[0])

    def test_a_photo_of_a_question_is_read_by_the_vision_model(self):
        create = self.groq(completion('The answer is 12.', input_tokens=3000, output_tokens=800))
        with patch('apps.bots.telegram.download_file', return_value=png_bytes()):
            self.deliver({'photo': [{'file_id': 'small'}, {'file_id': 'large'}], 'caption': 'Question 4 please'})

        sent = create.call_args.kwargs
        self.assertEqual(sent['model'], 'meta-llama/llama-4-scout-17b-16e-instruct')
        self.assertEqual(sent['messages'][1]['content'][1]['type'], 'image_url')
        self.assertIn('Question 4 please', sent['messages'][1]['content'][0]['text'])
        self.assertEqual(AIUsageRecord.objects.get().feature, 'image_question')
        self.assertIn('The answer is 12.', self.telegram.last_text())

    def test_a_file_that_is_not_a_photo_is_refused_without_charging(self):
        create = self.groq(completion())
        with patch('apps.bots.telegram.download_file', return_value=b'not an image'):
            self.deliver({'photo': [{'file_id': 'x'}]})
        create.assert_not_called()
        self.assertIn('could not read that photo', self.telegram.last_text())

    def test_voice_notes_are_answered_kindly(self):
        self.deliver({'voice': {'file_id': 'v'}})
        self.assertIn('Voice questions are coming soon', self.telegram.last_text())

    # --- credits -----------------------------------------------------------

    def test_running_out_of_credits_says_so_before_asking_the_model(self):
        self.deliver({'text': '/start'})
        account = credit_engine.get_account(self.identity().user)
        account.daily_free_remaining = 1
        account.save()
        create = self.groq(completion())

        self.deliver({'text': 'Explain the French revolution'})

        create.assert_not_called()
        self.assertIn('Not enough AI credits', self.telegram.last_text())
        self.assertIn('100 free credits a day instead of 30', self.telegram.last_text())

    def test_a_heavy_request_asks_first_and_runs_on_continue(self):
        self.configure(confirm_above_credits=3)
        create = self.groq(completion('Long answer.'))

        self.deliver({'text': 'Explain photosynthesis in detail'})
        self.assertIn('Continue?', self.telegram.last_text())
        create.assert_not_called()
        buttons = self.telegram.sent()[-1]['reply_markup']['inline_keyboard'][0]

        self.deliver(callback=buttons[0]['callback_data'])

        self.assertIn('Long answer.', self.telegram.last_text())
        self.assertEqual(create.call_count, 1)

    def test_cancel_uses_nothing(self):
        self.configure(confirm_above_credits=3)
        create = self.groq(completion())
        self.deliver({'text': 'Explain photosynthesis in detail'})
        cancel = self.telegram.sent()[-1]['reply_markup']['inline_keyboard'][0][1]['callback_data']

        self.deliver(callback=cancel)

        create.assert_not_called()
        edits = self.telegram.sent('editMessageText')
        self.assertIn('No credits were used', edits[-1]['text'])

    def test_a_provider_failure_costs_nothing(self):
        self.groq(error=RuntimeError('down'))
        self.deliver({'text': 'What is a noun?'})

        self.assertIn('No credits were used', self.telegram.last_text())
        self.assertEqual(credit_engine.balance(self.identity().user)['total_available'], 30)

    def test_the_balance_is_shown(self):
        self.deliver({'text': '/balance'})
        self.assertIn('Daily free: <b>30</b> / 30', self.telegram.last_text())

    def test_questions_sent_too_fast_are_slowed_down(self):
        self.groq(*[completion('ok') for _ in range(9)])
        for _ in range(9):
            self.deliver({'text': 'What is a noun?'})
        self.assertIn('very fast', self.telegram.last_text())

    # --- linking an EduIgnite account --------------------------------------

    def make_user(self, role='STUDENT'):
        return User.objects.create_user(matricule='REAL-1', name='Amina Njoya', email='amina@example.org',
                                        role=role, password='not-a-real-password')

    def test_linking_brings_the_account_and_the_bought_credits(self):
        self.deliver({'text': '/start'})
        guest = self.identity().user
        credit_engine.grant(guest, 200, AICreditTransaction.PURCHASE, reference_id='gw:G1')
        student = self.make_user()
        code = BotLinkCode.issue(student)

        self.deliver({'text': f'/start link_{code.code}'})

        identity = self.identity()
        self.assertEqual(identity.user, student)
        self.assertTrue(identity.is_linked)
        self.assertIn('Linked to <b>Amina Njoya</b>', self.telegram.last_text())
        self.assertIn('200 bought credits came with you', self.telegram.last_text())
        self.assertEqual(credit_engine.balance(student)['purchased_balance'], 200)
        self.assertEqual(credit_engine.balance(student)['daily_free_limit'], 100)
        self.assertEqual(credit_engine.balance(guest)['purchased_balance'], 0)
        code.refresh_from_db()
        self.assertIsNotNone(code.used_at)

    def test_a_used_or_wrong_code_does_not_link(self):
        student = self.make_user()
        code = BotLinkCode.issue(student)
        self.deliver({'text': f'/link {code.code}'})
        self.deliver({'text': '/unlink'})
        self.deliver({'text': f'/link {code.code}'})
        self.assertIn('not valid or has expired', self.telegram.last_text())
        self.deliver({'text': '/link WRONG123'})
        self.assertIn('not valid or has expired', self.telegram.last_text())

    def test_the_app_issues_a_code_and_can_unlink(self):
        student = self.make_user()
        self.api.force_authenticate(student)

        response = self.api.post('/api/v1/bots/telegram/link-code/')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['url'].startswith('https://t.me/EduIgniteAIBot?start=link_'))

        self.deliver({'text': f"/start link_{response.data['code']}"})
        status = self.api.get('/api/v1/bots/telegram/').data
        self.assertTrue(status['available'])
        self.assertEqual(len(status['connections']), 1)

        self.assertEqual(self.api.delete(f"/api/v1/bots/telegram/connections/{status['connections'][0]['id']}/").status_code, 204)
        self.assertEqual(self.identity().user.role, 'AI_GUEST')

    def test_a_linked_student_asks_as_themselves(self):
        student = self.make_user()
        code = BotLinkCode.issue(student)
        self.deliver({'text': f'/link {code.code}'})
        self.groq(completion('ok'))
        self.deliver({'text': 'What is a noun?'})
        self.assertEqual(AIUsageRecord.objects.get().user, student)

    # --- buying credits ----------------------------------------------------

    def test_buying_credits_from_the_chat(self):
        self.configure(price_per_credit=Decimal('2'))
        self.deliver({'text': '/buy 500'})
        self.assertIn('500 credits</b> for <b>1,000 FCFA', self.telegram.last_text())
        self.assertTrue(self.telegram.sent()[-1]['reply_markup']['keyboard'][0][0]['request_contact'])

        remote = {'status': 'SUCCESSFUL', 'amount': 1000}
        with patch('apps.fees.fapshi.direct_pay', return_value={'transId': 'FAP-BOT'}) as pay, \
                patch('apps.fees.fapshi.payment_status', return_value=remote):
            self.deliver({'contact': {'phone_number': '+237 677 12 34 56', 'user_id': TG_USER}})

        self.assertEqual(pay.call_args.kwargs['phone'], '677123456')
        self.assertEqual(pay.call_args.kwargs['amount'], 1000)
        texts = self.telegram.texts()
        self.assertTrue(any('payment request for <b>1,000 FCFA</b>' in text for text in texts))
        self.assertIn('500 credits added!', texts[-1])
        self.assertEqual(credit_engine.balance(self.identity().user)['purchased_balance'], 500)
        self.assertEqual(GatewayTransaction.objects.get().initiated_by, self.identity().user)

    def test_buying_is_closed_until_a_price_is_set(self):
        self.deliver({'text': '/buy'})
        self.assertIn('opens soon', self.telegram.last_text())

    def test_a_wrong_number_is_asked_again(self):
        self.configure(price_per_credit=Decimal('2'))
        self.deliver({'text': '/buy 500'})
        self.deliver({'text': '12345'})
        self.assertIn('does not look like a mobile money number', self.telegram.last_text())

    def test_phone_numbers_are_normalised(self):
        self.assertEqual(normalise_phone('+237 6 77 12 34 56'), '677123456')
        self.assertEqual(normalise_phone('00237677123456'), '677123456')
        self.assertEqual(normalise_phone('677123456'), '677123456')
        self.assertIsNone(normalise_phone('0123'))

    # --- language and the render page -------------------------------------

    def test_french_speakers_are_answered_in_french(self):
        self.update_id += 1
        update = {'update_id': self.update_id, 'message': {
            'message_id': 1, 'chat': {'id': TG_USER, 'type': 'private'}, 'text': '/balance',
            'from': {'id': TG_USER, 'first_name': 'Paul', 'language_code': 'fr'}}}
        self.client.post(WEBHOOK, update, content_type='application/json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=SECRET)
        self.assertIn('Vos crédits IA', self.telegram.last_text())
        self.deliver({'text': '/language'})
        self.assertIn('English', self.telegram.last_text())

    def test_the_print_page_fetches_its_answer_once_by_token(self):
        from apps.bots import rendering

        token = rendering.stash_for_render('Q?', 'A.', asked_by='Amina')
        response = self.client.get(f'/api/v1/bots/render/{token}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['answer'], 'A.')
        self.assertEqual(self.client.get('/api/v1/bots/render/not-a-token/').status_code, 404)


class FormattingTests(TestCase):
    def test_mathematics_becomes_readable_symbols(self):
        self.assertEqual(formatting.latex_to_text(r'\frac{a}{b} \times \sqrt{x^2 + 1} \leq \pi'), 'a/b × √(x² + 1) ≤ π')
        self.assertEqual(formatting.latex_to_text(r'x_{1} = 2^{10}'), 'x₁ = 2¹⁰')
        self.assertEqual(formatting.latex_to_text(r'\boxed{x = 3}'), '【x = 3】')

    def test_charts_and_diagrams_need_a_pdf(self):
        self.assertTrue(formatting.needs_pdf('```graph\n{}\n```'))
        self.assertTrue(formatting.needs_pdf('```mermaid\nflowchart TD\n```'))
        self.assertTrue(formatting.needs_pdf('```figure\n{"shapes": []}\n```'))
        self.assertFalse(formatting.needs_pdf('```python\nprint(1)\n```'))

    def test_markdown_becomes_telegram_html(self):
        html = formatting.to_telegram_html('### Title\n- **bold** and `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |')
        self.assertIn('<b>Title</b>', html)
        self.assertIn('• <b>bold</b> and <code>code</code>', html)
        self.assertIn('<pre>a  b\n1  2</pre>', html)

    def test_html_in_answers_is_escaped(self):
        self.assertIn('a &lt; b', formatting.to_telegram_html('a < b'))

    def test_long_answers_are_split_under_the_limit(self):
        parts = formatting.split_for_telegram(('word ' * 200 + '\n\n') * 20)
        self.assertTrue(all(len(part) <= formatting.CHUNK for part in parts))
        self.assertGreater(len(parts), 1)



@override_settings(TELEGRAM_BOT_TOKEN='123:test', TELEGRAM_WEBHOOK_SECRET=SECRET, TELEGRAM_BOT_USERNAME='EduIgniteAIBot',
                   GROQ_API_KEY='test-key', GROQ_MODEL=MODEL, CELERY_TASK_ALWAYS_EAGER=True)
class TelegramFreeModeTests(TestCase):
    """While AI is free, the bot says so and charges nothing."""

    deliver = TelegramBotTests.deliver
    groq = TelegramBotTests.groq

    def setUp(self):
        cache.clear()
        credit_engine.invalidate_config()  # the default: free
        self.telegram = FakeTelegram()
        patch('apps.bots.telegram.call', side_effect=self.telegram).start()
        self.addCleanup(patch.stopall)
        self.update_id = 1

    def test_the_bot_says_it_is_free(self):
        self.deliver({'text': '/start'})
        self.assertIn('free</b> to use right now', self.telegram.last_text())
        self.deliver({'text': '/buy'})
        self.assertIn('nothing to buy', self.telegram.last_text())

    def test_answers_cost_nothing(self):
        self.groq(completion('Free answer.'))
        self.deliver({'text': 'What is a noun?'})
        self.assertIn('Free answer.', self.telegram.last_text())
        self.assertNotIn('credits ·', self.telegram.last_text())
        self.assertEqual(AIUsageRecord.objects.get().charged_credits, 0)
