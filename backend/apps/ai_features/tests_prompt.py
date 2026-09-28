"""What the assistant is told before it answers.

The chat is read in a bubble, usually on a phone, and the apps render the
markdown themselves. So two things have to be true of every request: the open
conversation is asked to answer briefly and offer the longer version, and any
answer a person will read is asked for the markdown the apps actually render.
Neither is true of a request for JSON, which must stay JSON.
"""

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from apps.ai_features.utils import call_groq_api


def _completion(text='ok'):
    completion = MagicMock()
    completion.choices = [MagicMock()]
    completion.choices[0].message.content = text
    completion.usage.total_tokens = 12
    return completion


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL='openai/gpt-oss-120b')
class SystemPromptTests(SimpleTestCase):
    def _call(self, **kwargs):
        with patch('groq.Groq') as groq:
            client = groq.return_value
            client.chat.completions.create.return_value = _completion()
            result = call_groq_api('How do I record a fee?', **kwargs)

        self.assertTrue(result['success'], result)
        return client.chat.completions.create.call_args.kwargs

    def _system_prompt(self, **kwargs):
        return self._call(**kwargs)['messages'][0]['content']

    def test_the_chat_is_asked_to_answer_briefly(self):
        prompt = self._system_prompt()

        self.assertIn('ANSWER SHAPE', prompt)
        self.assertIn('one or two short sentences', prompt)
        self.assertIn('Never answer with a wall of text', prompt)

    def test_the_chat_is_asked_to_offer_the_longer_version(self):
        self.assertIn('Would you like me to go through the steps in detail?', self._system_prompt())

    def test_a_feature_with_its_own_prompt_is_not_shortened(self):
        """A guidance report or a roadmap is meant to be long."""
        self.assertNotIn('ANSWER SHAPE', self._system_prompt(purpose='student_guidance'))

    def test_every_readable_answer_is_asked_for_markdown_the_apps_render(self):
        for kwargs in ({}, {'purpose': 'student_guidance'}):
            with self.subTest(kwargs=kwargs):
                prompt = self._system_prompt(**kwargs)
                self.assertIn('FORMATTING', prompt)
                self.assertIn('"- " for bullets', prompt)

    def test_a_request_for_json_is_told_nothing_about_markdown(self):
        prompt = self._system_prompt(response_format={'type': 'json_object'})

        self.assertNotIn('FORMATTING', prompt)
        self.assertNotIn('ANSWER SHAPE', prompt)

    def test_the_scope_and_loyalty_rules_survive_all_of_this(self):
        prompt = self._system_prompt()

        self.assertIn('SCOPE:', prompt)
        self.assertIn('LOYALTY:', prompt)

    def test_thinking_is_kept_short_so_the_answer_fits(self):
        """gpt-oss pays for its thinking out of max_tokens; the chat allows 900."""
        kwargs = self._call()

        self.assertEqual(kwargs['extra_body'], {'reasoning_effort': 'low'})

    @override_settings(GROQ_MODEL='llama-3.1-8b-instant')
    def test_a_model_that_does_not_think_is_sent_nothing_extra(self):
        self.assertNotIn('extra_body', self._call())
