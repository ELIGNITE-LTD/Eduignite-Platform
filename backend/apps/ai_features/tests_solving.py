"""The problem set that caught the tutor out, as tests.

Three A-Level Physics questions were answered with scratch reasoning on
screen, checks that disagreed and were waved away as rounding, a false claim
about where a projectile peaks on a slope, a trajectory drawn as a vertical
line and a discharge curve that was listed but never drawn.

Each of those is a test here. The fixtures hold the known answers; the
generators check the pipeline on inputs nobody has seen, so passing cannot be
memorised.
"""

import math
import random

from django.test import SimpleTestCase

from apps.ai_features.solving import charts
from apps.ai_features.solving.compute import ComputeError, Computed, Quantity, compute_all, evaluate
from apps.ai_features.solving.lint import lint_answer, check_consistency, check_scratch
from apps.ai_features.solving.physics import piecewise_motion, projectile_on_incline, rc_circuit


def close(actual, expected, tolerance=5e-3):
    return abs(actual - expected) <= tolerance * max(abs(expected), 1e-12)


# ── Stage 2: the arithmetic is done by code ─────────────────────────────────

class ComputeTests(SimpleTestCase):
    def test_it_evaluates_an_expression(self):
        self.assertAlmostEqual(evaluate('2*u*sin(a)/g', {'u': 24, 'a': math.radians(50), 'g': 9.81}), 3.7483, places=3)

    def test_steps_can_use_earlier_steps(self):
        computed = compute_all(
            [{'name': 'T', 'expr': '2*u/g', 'unit': 's'}, {'name': 'R', 'expr': 'u*T', 'unit': 'm'}],
            givens={'u': 10.0, 'g': 9.81},
        )
        self.assertAlmostEqual(computed.value('T'), 2.0387, places=3)
        self.assertAlmostEqual(computed.value('R'), 20.387, places=2)

    def test_an_unknown_name_is_refused(self):
        with self.assertRaises(ComputeError):
            evaluate('u * mystery', {'u': 2})

    def test_an_unknown_function_is_refused(self):
        with self.assertRaises(ComputeError):
            evaluate('system("rm -rf /")', {})

    def test_model_written_code_cannot_escape(self):
        """The expression comes from a model, and a model can be steered."""
        for attack in (
            '__import__("os").system("echo hi")',
            'eval("2+2")',
            '(lambda: 1)()',
            'open("/etc/passwd").read()',
        ):
            with self.subTest(attack=attack):
                with self.assertRaises(ComputeError):
                    evaluate(attack, {})

    def test_an_enormous_exponent_is_refused(self):
        with self.assertRaises(ComputeError):
            evaluate('9**9999', {})

    def test_rounding_happens_at_display_not_in_the_maths(self):
        q = Quantity(name='T', value=2.5983558, unit='s', significant_figures=3)
        self.assertEqual(q.display(), '2.6 s')
        self.assertAlmostEqual(q.value, 2.5983558)


# ── Fixture Q1: projectile on an incline ────────────────────────────────────

class ProjectileOnInclineTests(SimpleTestCase):
    """24 m/s at 50 degrees onto a 20 degree slope, g = 9.81."""

    def setUp(self):
        self.solution = projectile_on_incline(u=24, launch_deg=50, slope_deg=20, g=9.81)
        self.computed = self.solution.computed

    def test_time_of_flight(self):
        self.assertTrue(close(self.computed.value('T'), 2.60, 5e-3), self.computed.value('T'))

    def test_range_along_the_slope(self):
        self.assertTrue(close(self.computed.value('R'), 42.7, 5e-3), self.computed.value('R'))

    def test_perpendicular_height(self):
        self.assertTrue(close(self.computed.value('H_perp'), 7.81, 5e-3), self.computed.value('H_perp'))

    def test_landing_point_in_horizontal_and_vertical_coordinates(self):
        self.assertTrue(close(self.computed.value('x_landing'), 40.2, 5e-3), self.computed.value('x_landing'))
        self.assertTrue(close(self.computed.value('y_landing'), 14.6, 5e-3), self.computed.value('y_landing'))

    def test_the_peak_is_at_half_the_time_of_flight(self):
        self.assertTrue(close(self.computed.value('t_peak'), self.computed.value('T') / 2, 1e-6))

    def test_the_peak_is_NOT_at_half_the_range(self):
        """The claim the tutor made, and the number it should have given."""
        self.assertTrue(close(self.computed.value('s_at_peak'), 24.2, 1e-2), self.computed.value('s_at_peak'))
        self.assertFalse(self.solution.facts['peak_is_at_half_range'])
        self.assertFalse(self.solution.facts['motion_along_slope_is_symmetric'])
        half_range = self.computed.value('R') / 2
        self.assertGreater(self.computed.value('s_at_peak'), half_range)

    def test_every_check_agrees(self):
        self.assertTrue(self.solution.verified, [c.sentence() for c in self.solution.failures()])

    def test_the_checks_are_real_computations(self):
        """A check line may only be printed if two routes really ran."""
        names = [check.name for check in self.solution.checks]
        self.assertIn('Time of flight, slope axes against horizontal and vertical axes', names)
        for check in self.solution.checks:
            self.assertNotEqual(check.first, None)
            self.assertNotEqual(check.second, None)

    def test_the_trajectory_is_a_parabola_not_a_vertical_line(self):
        problems = charts.check_not_degenerate({'trajectory': self.solution.curves['trajectory']})
        self.assertEqual(problems, [])

    def test_the_trajectory_passes_through_the_computed_landing_point(self):
        expected = charts.key_points_from(self.computed, {'landing': ('x_landing', 'y_landing')})
        problems = charts.check_key_points(self.solution.curves['trajectory'], expected, tolerance=5e-3)
        self.assertEqual(problems, [], problems)


class ProjectileGeneratorTests(SimpleTestCase):
    """Random launches, checked against the closed form, so nothing is memorised."""

    def test_random_launches_all_verify(self):
        rng = random.Random(20261004)
        for _ in range(60):
            u = rng.uniform(5, 60)
            slope = rng.uniform(1, 35)
            launch = rng.uniform(slope + 5, 85)
            solution = projectile_on_incline(u=u, launch_deg=launch, slope_deg=slope)
            with self.subTest(u=round(u, 2), launch=round(launch, 2), slope=round(slope, 2)):
                self.assertTrue(solution.verified, [c.sentence() for c in solution.failures()])

    def test_the_peak_is_never_at_half_range_on_a_real_slope(self):
        """Gravity has a component along the slope, so it cannot be."""
        rng = random.Random(7)
        for _ in range(25):
            slope = rng.uniform(5, 35)
            launch = rng.uniform(slope + 10, 85)
            solution = projectile_on_incline(u=rng.uniform(10, 50), launch_deg=launch, slope_deg=slope)
            with self.subTest(slope=round(slope, 2)):
                self.assertFalse(solution.facts['peak_is_at_half_range'])


# ── Fixture Q2: piecewise motion ────────────────────────────────────────────

class PiecewiseMotionTests(SimpleTestCase):
    """a = 6 - 0.5t until t = 12, then zero."""

    def setUp(self):
        self.solution = piecewise_motion(a0=6.0, k=0.5, t_switch=12.0, t_end=20.0)
        self.computed = self.solution.computed

    def test_maximum_speed(self):
        self.assertTrue(close(self.computed.value('v_max'), 36.0), self.computed.value('v_max'))
        self.assertTrue(close(self.computed.value('t_v_max'), 12.0))

    def test_distance_at_the_switch_and_at_the_end(self):
        self.assertTrue(close(self.computed.value('x_switch'), 288.0), self.computed.value('x_switch'))
        self.assertTrue(close(self.computed.value('x_end'), 576.0), self.computed.value('x_end'))

    def test_there_is_no_point_of_inflection(self):
        """Acceleration never changes sign, so displacement has no inflection."""
        self.assertFalse(self.solution.facts['acceleration_changes_sign'])
        self.assertFalse(self.solution.facts['displacement_has_inflection'])

    def test_the_join_is_smooth_in_position_and_velocity(self):
        self.assertTrue(self.solution.verified, [c.sentence() for c in self.solution.failures()])
        self.assertTrue(self.solution.facts['acceleration_is_continuous_at_switch'])


# ── Fixture Q3: RC circuit ──────────────────────────────────────────────────

class RcCircuitTests(SimpleTestCase):
    """470 uF, 2.2 kOhm, 9.0 V."""

    def setUp(self):
        self.solution = rc_circuit(capacitance=470e-6, resistance=2200.0, emf=9.0)
        self.computed = self.solution.computed

    def test_time_constant(self):
        self.assertTrue(close(self.computed.value('tau'), 1.03, 5e-3), self.computed.value('tau'))

    def test_voltages_at_one_two_and_five_time_constants(self):
        self.assertTrue(close(self.computed.value('V_tau'), 5.69, 5e-3))
        self.assertTrue(close(self.computed.value('V_2tau'), 7.78, 5e-3))
        self.assertTrue(close(self.computed.value('V_5tau'), 8.94, 5e-3))

    def test_energies(self):
        self.assertTrue(close(self.computed.value('E_stored'), 1.90e-2, 5e-3), self.computed.value('E_stored'))
        self.assertTrue(close(self.computed.value('E_dissipated'), 1.90e-2, 5e-3))

    def test_energy_is_conserved(self):
        self.assertTrue(self.solution.verified, [c.sentence() for c in self.solution.failures()])

    def test_both_curves_are_drawn(self):
        """The discharge curve was listed in the legend and never drawn."""
        problems = charts.check_curve_present(self.solution.curves, ['charging', 'discharging'])
        self.assertEqual(problems, [], problems)

    def test_a_missing_discharge_curve_is_caught(self):
        problems = charts.check_curve_present({'charging': self.solution.curves['charging']}, ['charging', 'discharging'])
        self.assertTrue(any(p.kind == 'missing-curve' for p in problems))

    def test_an_empty_curve_behind_a_legend_entry_is_caught(self):
        problems = charts.check_curve_present({'charging': [], 'discharging': []}, ['charging', 'discharging'])
        self.assertEqual(len(problems), 2)


# ── Stage 6: the output gate ────────────────────────────────────────────────

class ScratchLintTests(SimpleTestCase):
    """The exact phrases a student was shown."""

    LEAKED = [
        "Wait, let's re-evaluate the perpendicular height.",
        "Let's re-examine the range along the slope.",
        "No, simpler: use the slope-aligned axes.",
        "Hmm, that gives 6.33 m which cannot be right.",
        "Let me recalculate the time of flight.",
        "I made a mistake above.",
        "There is a discrepancy between the two methods.",
        "This matches the earlier value closely.",
        "Actually, the peak is not at the midpoint.",
    ]

    def test_every_leaked_phrase_is_caught(self):
        for text in self.LEAKED:
            with self.subTest(text=text):
                self.assertTrue(check_scratch(text), f'not caught: {text}')

    def test_a_clean_explanation_passes(self):
        text = (
            'Resolving along and perpendicular to the slope gives a time of flight '
            'of 2.60 s. Check: the horizontal method gives the same 2.60 s.'
        )
        self.assertEqual(check_scratch(text), [])

    def test_the_word_await_is_not_mistaken_for_wait(self):
        self.assertEqual(check_scratch('The student should await the result.'), [])

    def test_a_scratch_phrase_inside_maths_is_ignored(self):
        self.assertEqual(check_scratch(r'The weight is $W = mg$ and so on.'), [])


class RawMathLintTests(SimpleTestCase):
    def test_raw_latex_delimiters_are_caught(self):
        from apps.ai_features.solving.lint import check_raw_math

        self.assertTrue(check_raw_math(r'The time is \(2.60\) s.'))
        self.assertTrue(check_raw_math(r'\[ T = 2.60 \]'))

    def test_an_unbalanced_dollar_is_caught(self):
        from apps.ai_features.solving.lint import check_raw_math

        self.assertTrue(check_raw_math('The answer is $2.60 s.'))

    def test_properly_paired_maths_passes(self):
        from apps.ai_features.solving.lint import check_raw_math

        self.assertEqual(check_raw_math('The answer is $2.60$ s and $$T = 2.60$$.'), [])


class ConsistencyLintTests(SimpleTestCase):
    def setUp(self):
        self.computed = Computed()
        self.computed.add(Quantity(name='T', value=2.5983, unit='s', significant_figures=3))
        self.computed.add(Quantity(name='R', value=42.743, unit='m', significant_figures=3))

    def test_a_number_we_never_computed_is_caught(self):
        """40.03 and 40.17 were both printed; neither can pass now."""
        problems = check_consistency('The range is 40.03 m.', self.computed)
        self.assertTrue(any(p.kind == 'consistency' for p in problems))

    def test_computed_values_pass(self):
        self.assertEqual(check_consistency('T is 2.60 s and R is 42.7 m.', self.computed), [])

    def test_numbers_from_the_question_pass(self):
        problems = check_consistency(
            'Launched at 24 m/s at 50 degrees.', self.computed, question_numbers=[24.0, 50.0]
        )
        self.assertEqual(problems, [])

    def test_counting_words_are_not_treated_as_measurements(self):
        self.assertEqual(check_consistency('In step 3, see part (2).', self.computed), [])


class CompletenessLintTests(SimpleTestCase):
    def test_a_missing_sub_part_is_caught(self):
        problems = lint_answer('### (a) Time\nT is 2.60 s.', required_parts=['a', 'b', 'c'])
        missing = [p.detail for p in problems if p.kind == 'completeness']
        self.assertEqual(len(missing), 2)

    def test_all_parts_answered_passes(self):
        text = '### (a) one\n### (b) two\n### (c) three'
        problems = [p for p in lint_answer(text, required_parts=['a', 'b', 'c']) if p.kind == 'completeness']
        self.assertEqual(problems, [])


class ChartValidationTests(SimpleTestCase):
    def test_a_vertical_line_trajectory_is_caught(self):
        """The Q1 failure: a parabola drawn as a near-vertical line."""
        vertical = [(10.0, y / 10) for y in range(60)]
        problems = charts.check_not_degenerate({'trajectory': vertical})
        self.assertTrue(any(p.kind == 'degenerate-curve' for p in problems))

    def test_a_real_parabola_passes(self):
        parabola = [(x / 4, 10 * (x / 4) - 0.5 * 9.81 * (x / 4) ** 2) for x in range(40)]
        self.assertEqual(charts.check_not_degenerate({'trajectory': parabola}), [])

    def test_a_straight_line_is_a_valid_curve(self):
        """The incline a projectile lands on is exactly two points."""
        problems = charts.check_curve_present({'incline': [(0.0, 0.0), (40.2, 14.6)]}, ['incline'])
        self.assertEqual(problems, [])

    def test_a_single_point_is_still_not_a_curve(self):
        problems = charts.check_curve_present({'incline': [(0.0, 0.0)]}, ['incline'])
        self.assertTrue(problems)

    def test_a_clipped_label_is_caught(self):
        curves = {'trajectory': [(0.0, 0.0), (10.0, 5.0)]}
        x_range, y_range = charts.axes_with_margin(curves)
        problems = charts.check_labels_fit([{'x': x_range[1], 'y': 2.5, 'text': 'landing'}], x_range, y_range)
        self.assertTrue(any(p.kind == 'clipped-label' for p in problems))

    def test_a_label_inside_the_axes_passes(self):
        curves = {'trajectory': [(0.0, 0.0), (10.0, 5.0)]}
        x_range, y_range = charts.axes_with_margin(curves)
        self.assertEqual(charts.check_labels_fit([{'x': 5.0, 'y': 2.5, 'text': 'peak'}], x_range, y_range), [])

    def test_a_key_point_off_the_curve_is_caught(self):
        curve = [(x / 10, (x / 10) ** 2) for x in range(100)]
        problems = charts.check_key_points(curve, {'peak': (5.0, 99.0)})
        self.assertTrue(problems)


class EndToEndGateTests(SimpleTestCase):
    """What the student would have been shown, refused."""

    def test_the_original_broken_answer_is_rejected(self):
        broken = (
            "### (a) Time of flight\n"
            "T is 2.60 s. Wait, let's re-evaluate: the perpendicular height is 6.33 m.\n"
            "Hmm, the horizontal method gives 40.03 m but the slope method gives 40.17 m, "
            "which is a discrepancy explained by rounding.\n"
            r"The answer is \(2.60\) s."
        )
        computed = Computed()
        computed.add(Quantity(name='T', value=2.5983, unit='s', significant_figures=3))
        problems = lint_answer(broken, computed, required_parts=['a', 'b'])
        kinds = {p.kind for p in problems}
        self.assertIn('scratch', kinds)
        self.assertIn('raw-math', kinds)
        self.assertIn('consistency', kinds)
        self.assertIn('completeness', kinds)

    def test_a_clean_verified_answer_passes_every_gate(self):
        solution = projectile_on_incline(u=24, launch_deg=50, slope_deg=20)
        computed = solution.computed
        text = (
            '### (a) Time of flight\n'
            'Resolving perpendicular to the slope, the projectile returns to the surface '
            'after $T = 2.60$ s.\n'
            'Check: working in horizontal and vertical axes gives the same 2.60 s.\n'
            '### (b) Range along the slope\n'
            'The range is 42.7 m.\n'
        )
        problems = lint_answer(text, computed, required_parts=['a', 'b'], question_numbers=[24.0, 50.0, 20.0])
        self.assertEqual(problems, [], [f'{p.kind}: {p.detail}' for p in problems])
