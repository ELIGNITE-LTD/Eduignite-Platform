"""Scratch work is taken out of a live answer, and the shape is asked for.

The first failure a student reported was reading the model change its mind:
"Wait, let's re-evaluate", a figure corrected two lines later, a note
re-deriving an answer already given. Stripping <think> tags never caught any
of it, because the model was reasoning in ordinary sentences.

These check the removal on real examples, and they check the thing that makes
a cleaner dangerous: that it leaves everything else alone and can never empty
an answer.
"""

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from apps.ai_features.solving.compose import ANSWER_STRUCTURE, polish, remove_scratch
from apps.ai_features.utils import call_groq_api


class RemoveScratchTests(SimpleTestCase):
    """The exact sentences the student was shown."""

    def test_a_self_correction_is_removed(self):
        text = 'The time of flight is 2.60 s. Wait, let me recalculate. It is 2.60 s.'

        cleaned, removed = remove_scratch(text)

        self.assertNotIn('Wait', cleaned)
        self.assertIn('The time of flight is 2.60 s.', cleaned)
        self.assertEqual(len(removed), 1)

    def test_the_surrounding_paragraph_survives(self):
        text = (
            'Resolving along the slope gives the range. Hmm, that cannot be right. '
            'The range is 42.7 m.'
        )

        cleaned, _ = remove_scratch(text)

        self.assertIn('Resolving along the slope gives the range.', cleaned)
        self.assertIn('The range is 42.7 m.', cleaned)
        self.assertNotIn('cannot be right', cleaned)

    def test_every_reported_phrase_is_removed(self):
        for sentence in (
            "Wait, let's re-evaluate the perpendicular height.",
            "Let's re-examine the range along the slope.",
            'No, simpler: use the slope-aligned axes.',
            'Let me recalculate the time of flight.',
            'I made a mistake above.',
            'There is a discrepancy between the two methods.',
            'Actually, the peak is not at the midpoint.',
        ):
            with self.subTest(sentence=sentence):
                cleaned, removed = remove_scratch(f'The answer is 2.60 s. {sentence}')
                self.assertEqual(removed, [sentence])
                self.assertIn('The answer is 2.60 s.', cleaned)

    def test_a_placeholder_sentence_is_removed(self):
        cleaned, removed = remove_scratch('The value is 5 m. As an AI, I cannot be certain.')

        self.assertNotIn('As an AI', cleaned)
        self.assertIn('The value is 5 m.', cleaned)

    def test_decimals_are_not_mistaken_for_sentence_ends(self):
        """Splitting on every full stop cut 6.33 into '6.' and '33'."""
        text = (
            'T = 2.60 s. Hmm, the height is 6.33 m. The range is 42.7 m.'
        )

        cleaned, removed = remove_scratch(text)

        self.assertIn('T = 2.60 s.', cleaned)
        self.assertIn('The range is 42.7 m.', cleaned)
        self.assertNotIn('s.33', cleaned)
        self.assertNotIn('6.', cleaned)

    def test_a_clean_answer_is_untouched(self):
        text = (
            'Resolving perpendicular to the slope, the projectile returns after 2.60 s. '
            'Check: the horizontal method gives the same 2.60 s.'
        )

        cleaned, removed = remove_scratch(text)

        self.assertEqual(cleaned, text)
        self.assertEqual(removed, [])

    def test_the_word_await_is_not_mistaken_for_wait(self):
        text = 'The student should await the result before continuing.'

        self.assertEqual(remove_scratch(text), (text, []))

    def test_a_fenced_block_is_never_cut_in_half(self):
        """A sentence inside a chart description is not prose."""
        text = 'Here is the path.\n```graph\n{"note": "wait for it"}\n```\nThe range is 42.7 m.'

        cleaned, removed = remove_scratch(text)

        self.assertIn('{"note": "wait for it"}', cleaned)
        self.assertIn('```graph', cleaned)
        self.assertEqual(removed, [])

    def test_headings_and_structure_survive(self):
        text = '### (a) Time of flight\nT is 2.60 s. Wait, let me check.\n\n### (b) Range\nR is 42.7 m.'

        cleaned, _ = remove_scratch(text)

        self.assertIn('### (a) Time of flight', cleaned)
        self.assertIn('### (b) Range', cleaned)
        self.assertNotIn('Wait', cleaned)


class PolishTests(SimpleTestCase):
    def test_it_reports_what_it_cannot_fix(self):
        cleaned, problems = polish(r'The time is \(2.60\) s.')

        self.assertTrue(any(p.kind == 'raw-math' for p in problems))

    def test_a_contradiction_is_reported_not_silently_edited(self):
        """Deleting one half of a contradiction would pick a side at random."""
        text = 'The motion is symmetric about the peak. The motion is not symmetric about the peak.'

        cleaned, problems = polish(text)

        self.assertTrue(any(p.kind == 'contradiction' for p in problems))
        self.assertIn('symmetric', cleaned)

    def test_a_good_answer_has_nothing_to_report(self):
        text = 'The range along the slope is 42.7 m, found by resolving along the slope.'

        cleaned, problems = polish(text)

        self.assertEqual(problems, [])
        self.assertEqual(cleaned, text)


class AnswerStructureTests(SimpleTestCase):
    def test_the_structure_names_every_part_of_a_model_answer(self):
        for part in ('Idea', 'Setup', 'Working', 'Check', 'Answer', 'Watch out'):
            self.assertIn(part, ANSWER_STRUCTURE)

    def test_the_check_line_must_be_a_real_check(self):
        """The old answers wrote a check line that never happened."""
        self.assertIn('never write it to fill the space', ANSWER_STRUCTURE)

    def test_the_solving_prompt_carries_the_structure(self):
        from apps.ai_features.paper import SOLVE_PROMPT

        self.assertIn('Idea -', SOLVE_PROMPT)
        self.assertIn('Watch out', SOLVE_PROMPT)


class WiredIntoTheLivePathTests(SimpleTestCase):
    def _completion(self, text):
        completion = MagicMock()
        completion.choices = [MagicMock()]
        completion.choices[0].message.content = text
        completion.usage.total_tokens = 10
        completion.usage.prompt_tokens = 5
        completion.usage.completion_tokens = 5
        return completion

    @override_settings(GROQ_API_KEY='test-key', GROQ_MODEL='openai/gpt-oss-120b')
    def _ask(self, text):
        with patch('groq.Groq') as groq:
            groq.return_value.chat.completions.create.return_value = self._completion(text)
            return call_groq_api('Solve it.')

    def test_scratch_never_reaches_the_caller(self):
        result = self._ask("T is 2.60 s. Wait, let's re-evaluate that.")

        self.assertTrue(result['success'])
        self.assertNotIn('Wait', result['response'])
        self.assertIn('2.60 s', result['response'])

    def test_a_clean_answer_is_returned_unchanged(self):
        text = 'The range along the slope is 42.7 m.'

        self.assertEqual(self._ask(text)['response'], text)

    def test_an_answer_that_is_entirely_scratch_is_kept_rather_than_emptied(self):
        """A cleaner that returns nothing has failed, not succeeded."""
        result = self._ask('Wait, let me reconsider.')

        self.assertTrue(result['response'].strip())

    def test_a_failure_in_the_cleaner_never_loses_the_answer(self):
        with patch('apps.ai_features.solving.compose.polish', side_effect=RuntimeError('boom')):
            result = self._ask('T is 2.60 s.')

        self.assertTrue(result['success'])
        self.assertIn('2.60 s', result['response'])

    def test_charts_and_cleaning_both_run(self):
        result = self._ask('Here it is. Wait, let me redo it.\n```graph\n{bad json}\n```')

        self.assertNotIn('Wait', result['response'])
        self.assertNotIn('bad json', result['response'])
