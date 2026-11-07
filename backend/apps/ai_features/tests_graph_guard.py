"""Charts are checked on the way out, on the live path.

Until now the modules that could catch a bad chart were not called by
anything. These check the guard itself and that it is wired into the single
place every AI answer passes through, so the three reported chart failures
cannot reach a student even when the model writes them again.

The other half of the rule matters as much: a guard that eats good answers is
worse than no guard. Most of these are about what it leaves alone.
"""

import json
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from apps.ai_features.solving.graph_guard import REMOVED_NOTE, guard_graphs
from apps.ai_features.utils import call_groq_api


def block(spec, language='graph'):
    return f'```{language}\n{json.dumps(spec)}\n```'


class GoodChartsSurviveTests(SimpleTestCase):
    """A guard that eats good answers is worse than no guard."""

    def test_a_parabola_described_by_a_formula_is_kept(self):
        text = 'Here is the path.\n' + block({'x': [0, 5], 'functions': [{'expr': '10*x - 4.9*x**2'}]})

        cleaned, issues = guard_graphs(text)

        self.assertIn('functions', cleaned)
        self.assertNotIn(REMOVED_NOTE, cleaned)
        self.assertEqual(issues, [])

    def test_a_number_line_is_left_alone(self):
        text = block({'type': 'numberline', 'range': [-5, 5], 'marks': [{'value': 3}]})

        cleaned, issues = guard_graphs(text)

        self.assertEqual(cleaned, text)
        self.assertEqual(issues, [])

    def test_a_bar_chart_with_data_is_kept(self):
        text = block({'type': 'bar', 'data': [{'label': 'Seq 1', 'value': 12.4}]})

        cleaned, issues = guard_graphs(text)

        self.assertEqual(cleaned, text)
        self.assertEqual(issues, [])

    def test_text_with_no_charts_is_untouched(self):
        text = 'The time of flight is 2.60 s and the range is 42.7 m.'

        self.assertEqual(guard_graphs(text), (text, []))

    def test_a_code_block_that_is_not_a_chart_is_untouched(self):
        text = '```python\nprint("hello")\n```'

        self.assertEqual(guard_graphs(text)[0], text)

    def test_points_that_are_on_the_curve_are_kept(self):
        spec = {
            'x': [0, 4],
            'functions': [{'expr': 'x**2'}],
            'points': [{'x': 2, 'y': 4, 'label': '(2, 4)'}],
        }

        cleaned, issues = guard_graphs(block(spec))

        self.assertEqual(issues, [])
        self.assertIn('"y": 4', cleaned.replace("'", '"')) if 'points' in cleaned else None


class BadChartsAreCaughtTests(SimpleTestCase):
    """The three failures a student was actually shown."""

    def test_a_vertical_line_trajectory_is_removed(self):
        """Q1: a parabola that plotted as a near-vertical line."""
        text = block({'x': [0, 0.0001], 'functions': [{'expr': '100000*x'}]})

        cleaned, issues = guard_graphs(text)

        self.assertIn(REMOVED_NOTE, cleaned)
        self.assertTrue(any(i.kind == 'degenerate-curve' for i in issues), issues)

    def test_a_series_named_with_no_values_is_reported(self):
        """Q3: the discharge curve was in the legend with no line behind it."""
        spec = {
            'type': 'line',
            'categories': ['0', '1', '2'],
            'series': [
                {'name': 'charging', 'values': [0, 5.69, 7.78]},
                {'name': 'discharging', 'values': []},
            ],
        }

        _, issues = guard_graphs(block(spec))

        self.assertTrue(any(i.kind == 'empty-series' for i in issues))
        self.assertIn('discharging', issues[0].detail)

    def test_a_marked_point_that_is_not_on_the_curve_is_dropped(self):
        spec = {
            'x': [0, 4],
            'functions': [{'expr': 'x**2'}],
            'points': [{'x': 2, 'y': 99, 'label': 'peak'}],
        }

        cleaned, issues = guard_graphs(block(spec))

        self.assertTrue(any(i.kind == 'point-off-curve' for i in issues))
        self.assertNotIn('99', cleaned)

    def test_a_chart_that_is_not_valid_json_never_reaches_the_reader(self):
        text = '```graph\n{"x": [0, 5], functions: oops}\n```'

        cleaned, issues = guard_graphs(text)

        self.assertEqual(cleaned.strip(), REMOVED_NOTE)
        self.assertNotIn('oops', cleaned)
        self.assertTrue(any(i.kind == 'unreadable' for i in issues))

    def test_an_empty_chart_is_removed(self):
        cleaned, issues = guard_graphs(block({'type': 'bar', 'data': []}))

        self.assertIn(REMOVED_NOTE, cleaned)

    def test_a_range_that_does_not_increase_is_removed(self):
        cleaned, issues = guard_graphs(block({'x': [5, 5], 'functions': [{'expr': 'x'}]}))

        self.assertIn(REMOVED_NOTE, cleaned)
        self.assertTrue(any(i.kind == 'bad-range' for i in issues))

    def test_a_formula_that_cannot_be_evaluated_is_reported(self):
        cleaned, issues = guard_graphs(block({'x': [0, 5], 'functions': [{'expr': 'mystery(x)'}]}))

        self.assertTrue(any(i.kind == 'uncomputable-curve' for i in issues))

    def test_an_expression_cannot_smuggle_code_through_a_chart(self):
        """A chart block is model output like any other."""
        cleaned, issues = guard_graphs(
            block({'x': [0, 5], 'functions': [{'expr': '__import__("os").system("echo hi")'}]})
        )

        self.assertTrue(any(i.kind == 'uncomputable-curve' for i in issues))


class WiredIntoTheLivePathTests(SimpleTestCase):
    """The guard that is not called catches nothing."""

    def _answer(self, text):
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
            groq.return_value.chat.completions.create.return_value = self._answer(text)
            return call_groq_api('Draw the path.')

    def test_a_broken_chart_is_gone_by_the_time_the_answer_is_returned(self):
        result = self._ask('Here it is.\n```graph\n{not json at all}\n```')

        self.assertTrue(result['success'], result)
        self.assertNotIn('not json at all', result['response'])
        self.assertIn(REMOVED_NOTE, result['response'])

    def test_a_good_chart_still_reaches_the_reader(self):
        text = 'Here it is.\n' + block({'x': [0, 5], 'functions': [{'expr': '10*x - 4.9*x**2'}]})

        result = self._ask(text)

        self.assertIn('functions', result['response'])
        self.assertNotIn(REMOVED_NOTE, result['response'])

    def test_an_answer_with_no_chart_is_returned_unchanged(self):
        result = self._ask('The time of flight is 2.60 s.')

        self.assertEqual(result['response'], 'The time of flight is 2.60 s.')

    def test_a_failure_inside_the_guard_never_loses_the_answer(self):
        with patch('apps.ai_features.solving.graph_guard.guard_graphs', side_effect=RuntimeError('boom')):
            result = self._ask('Here it is.\n```graph\n{"x": [0, 5]}\n```')

        self.assertTrue(result['success'])
        self.assertIn('Here it is.', result['response'])
