"""Every Groq key is used together: a key at its limit hands over to the next."""

from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from apps.ai_features import groq_keys
from apps.ai_features.utils import call_groq_api

MODEL = 'openai/gpt-oss-120b'
LIMIT = Exception(
    "Error code: 429 - {'error': {'message': 'Rate limit reached for model `openai/gpt-oss-120b` on tokens "
    "per minute (TPM): Limit 8000, Used 7900, Requested 900. Please try again in 7.5s.', "
    "'code': 'rate_limit_exceeded'}}"
)


def completion(text='ok'):
    result = MagicMock()
    result.choices = [MagicMock()]
    result.choices[0].message.content = text
    result.choices[0].finish_reason = 'stop'
    result.usage.prompt_tokens = 10
    result.usage.completion_tokens = 5
    result.usage.total_tokens = 15
    result.usage.prompt_tokens_details.cached_tokens = 0
    return result


@override_settings(
    GROQ_API_KEY='key-main', GROQ_FAST_API_KEY='key-main', GROQ_EXAM_API_KEY='', GROQ_CAREER_API_KEY='',
    GROQ_API_KEYS=['key-extra-1', 'key-main'], GROQ_API_KEY_2='key-extra-2', GROQ_MODEL=MODEL,
)
class KeyPoolTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def call(self, behaviour):
        """Each key behaves as given ('ok' or an exception); returns the keys used."""
        used = []

        def client(api_key, **_options):
            used.append(api_key)
            instance = MagicMock()
            outcome = behaviour.get(api_key, 'ok')
            if isinstance(outcome, Exception):
                instance.chat.completions.create.side_effect = outcome
            else:
                instance.chat.completions.create.return_value = completion(f'answer from {api_key}')
            return instance

        with patch('groq.Groq', side_effect=client):
            result = call_groq_api('What is osmosis?')
        return result, used

    def test_every_distinct_key_is_in_the_pool_once(self):
        self.assertEqual(groq_keys.all_keys(), ['key-main', 'key-extra-1', 'key-extra-2'])

    def test_a_key_at_its_limit_hands_over_to_the_next(self):
        result, used = self.call({'key-main': LIMIT})

        self.assertTrue(result['success'], result)
        self.assertEqual(result['response'], 'answer from key-extra-1')
        self.assertEqual(used, ['key-main', 'key-extra-1'])

    def test_a_key_at_its_limit_rests_and_is_tried_last_next_time(self):
        self.call({'key-main': LIMIT})
        self.assertTrue(groq_keys.is_resting('key-main', MODEL))

        _, used = self.call({})
        self.assertEqual(used, ['key-extra-1'])

    def test_when_every_key_is_busy_the_last_one_waits_as_groq_asks(self):
        retries = []

        def client(api_key, max_retries=None, **_options):
            retries.append((api_key, max_retries))
            instance = MagicMock()
            instance.chat.completions.create.side_effect = LIMIT
            return instance

        with patch('groq.Groq', side_effect=client):
            result = call_groq_api('What is osmosis?')

        self.assertFalse(result['success'])
        self.assertEqual([key for key, _ in retries], ['key-main', 'key-extra-1', 'key-extra-2'])
        self.assertEqual([count for _, count in retries][:2], [0, 0])
        self.assertGreaterEqual(retries[-1][1], 0)

    def test_a_broken_request_is_not_passed_round_every_key(self):
        result, used = self.call({'key-main': Exception('Error code: 400 - bad request')})

        self.assertFalse(result['success'])
        self.assertEqual(used, ['key-main'])

    def test_a_request_too_large_for_any_key_is_not_passed_round(self):
        too_large = Exception('Error code: 413 - Request too large for model on tokens per minute (TPM): '
                              'Limit 8000, Requested 9000 rate_limit_exceeded')
        result, used = self.call({'key-main': too_large})

        self.assertFalse(result['success'])
        self.assertEqual(used, ['key-main'])

    def test_the_rest_follows_what_groq_asked(self):
        groq_keys.rest('key-x', MODEL, 'Please try again in 1m30s.')
        self.assertTrue(groq_keys.is_resting('key-x', MODEL))
        self.assertFalse(groq_keys.is_resting('key-x', 'qwen/qwen3.8-27b'))

    def test_keys_are_never_stored_in_the_cache(self):
        groq_keys.rest('gsk_secret_value', MODEL)
        self.assertNotIn('gsk_secret_value', groq_keys._rest_key('gsk_secret_value', MODEL))
