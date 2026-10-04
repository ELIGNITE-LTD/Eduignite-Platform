"""Verification, repair, and telling the truth when it still does not agree.

The worst failure in the physics set was not a wrong number. Every number was
right. What was wrong was a sentence claiming the peak sits at the midpoint of
the slope range, printed directly under working that proved otherwise. No
arithmetic check catches that, so the claim audit here does.

The rest is what happens when checks disagree: feed the discrepancy back, try
again up to three times, and if it still fails, say so rather than present a
guess as certain.
"""

from django.test import SimpleTestCase

from apps.ai_features.solving.claims import audit_claims, claims_made_in
from apps.ai_features.solving.compute import Computed, Quantity
from apps.ai_features.solving.physics import Check, Solution, piecewise_motion, projectile_on_incline, rc_circuit
from apps.ai_features.solving.verify import MAX_REPAIR_ATTEMPTS, verify


def solution_with(checks, facts=None, curves=None):
    return Solution(
        computed=Computed(), checks=list(checks), facts=dict(facts or {}), curves=dict(curves or {})
    )


# ── The claim audit ─────────────────────────────────────────────────────────

class ClaimAuditTests(SimpleTestCase):
    """The sentence that was wrong while every number was right."""

    def setUp(self):
        self.solution = projectile_on_incline(u=24, launch_deg=50, slope_deg=20)

    def test_the_false_symmetry_claim_is_caught(self):
        text = 'For the sketch, the path is symmetric about the peak of the slope range.'

        problems = audit_claims(text, self.solution.facts)

        self.assertTrue(problems)
        self.assertEqual(problems[0].kind, 'false-claim')
        self.assertIn('not symmetric', problems[0].detail)

    def test_the_peak_at_half_range_claim_is_caught(self):
        text = 'The maximum perpendicular height occurs at half the range, R/2.'

        problems = audit_claims(text, self.solution.facts)

        self.assertTrue(any(p.kind == 'false-claim' for p in problems))

    def test_the_correction_says_what_is_actually_true(self):
        problems = audit_claims('It is symmetric about the peak.', self.solution.facts)

        self.assertIn('gravity has a component along it', problems[0].detail)

    def test_the_true_statement_passes(self):
        text = (
            'The motion along the slope is not symmetric, so the peak at 24.2 m '
            'is past the midpoint of the 42.7 m range.'
        )

        self.assertEqual(audit_claims(text, self.solution.facts), [])

    def test_a_claim_about_something_never_computed_is_unsupported(self):
        """Right or wrong, nothing in the pipeline knows."""
        problems = audit_claims('The motion is symmetric about the peak.', facts={})

        self.assertEqual(len(problems), 1)
        self.assertEqual(problems[0].kind, 'unsupported-claim')

    def test_an_inflection_claimed_where_there_is_none_is_caught(self):
        solution = piecewise_motion(a0=6.0, k=0.5, t_switch=12.0, t_end=20.0)

        problems = audit_claims('There is a point of inflection at t = 12 s.', solution.facts)

        self.assertTrue(any(p.kind == 'false-claim' for p in problems))

    def test_saying_there_is_no_inflection_passes(self):
        solution = piecewise_motion(a0=6.0, k=0.5, t_switch=12.0, t_end=20.0)

        self.assertEqual(
            audit_claims('There is no point of inflection, since a never changes sign.', solution.facts),
            [],
        )

    def test_a_chemistry_claim_is_settled_the_same_way(self):
        from apps.ai_features.solving import chemistry

        exothermic = chemistry.energy_change(mass_g=100.0, temp_change_k=5.0)
        self.assertEqual(audit_claims('The reaction is exothermic.', exothermic.facts), [])
        self.assertTrue(audit_claims('The reaction is endothermic.', exothermic.facts))

    def test_a_biology_ratio_claim_is_settled_the_same_way(self):
        from apps.ai_features.solving import biology

        cross = biology.monohybrid_cross('Aa', 'aa')
        self.assertTrue(audit_claims('The ratio is 3:1.', cross.facts))
        self.assertEqual(audit_claims('The ratio is 1:1.', cross.facts), [])

    def test_the_claims_an_answer_makes_can_be_listed(self):
        found = claims_made_in('The motion is symmetric about the peak and the reaction is exothermic.')

        self.assertIn('motion_along_slope_is_symmetric', found)
        self.assertIn('reaction_is_exothermic', found)


# ── The repair loop ─────────────────────────────────────────────────────────

class RepairLoopTests(SimpleTestCase):
    def test_a_solver_that_agrees_first_time_runs_once(self):
        calls = []

        def solve(previous_failures):
            calls.append(previous_failures)
            return solution_with([Check('a', 1.0, 1.0)])

        result = verify(solve)

        self.assertEqual(len(calls), 1)
        self.assertTrue(result.fully_verified)
        self.assertEqual(result.badge, 'Verified')

    def test_a_disagreement_is_fed_back_to_the_next_attempt(self):
        seen = []

        def solve(previous_failures):
            seen.append(list(previous_failures))
            if len(seen) < 2:
                return solution_with([Check('Range by two routes', 40.03, 40.17, 'm')])
            return solution_with([Check('Range by two routes', 42.7, 42.7, 'm')])

        result = verify(solve)

        self.assertEqual(len(seen), 2)
        self.assertEqual(seen[0], [])
        self.assertIn('40.03', seen[1][0])
        self.assertTrue(result.fully_verified)

    def test_it_gives_up_after_three_attempts(self):
        calls = []

        def solve(previous_failures):
            calls.append(1)
            return solution_with([Check('Never agrees', 1.0, 2.0)])

        result = verify(solve)

        self.assertEqual(len(calls), MAX_REPAIR_ATTEMPTS)
        self.assertFalse(result.fully_verified)

    def test_a_solver_that_raises_is_not_retried_into_the_ground(self):
        calls = []

        def solve(previous_failures):
            calls.append(1)
            raise ValueError('the model returned nothing usable')

        result = verify(solve)

        self.assertEqual(len(calls), 1)
        self.assertEqual(result.badge, 'Not verified')
        self.assertIn('could not be solved reliably', result.honest_note())

    def test_every_attempt_is_recorded(self):
        def solve(previous_failures):
            return solution_with([Check('Never agrees', 1.0, 2.0)])

        result = verify(solve)

        self.assertEqual(len(result.attempts), MAX_REPAIR_ATTEMPTS)
        self.assertEqual([a.number for a in result.attempts], [1, 2, 3])
        self.assertTrue(all(not a.verified for a in result.attempts))


# ── Honest failure ──────────────────────────────────────────────────────────

class HonestFailureTests(SimpleTestCase):
    def test_a_verified_answer_says_nothing_extra(self):
        result = verify(lambda failures: solution_with([Check('a', 1.0, 1.0)]))

        self.assertEqual(result.honest_note(), '')
        self.assertEqual(result.badge, 'Verified')

    def test_a_partial_answer_names_what_held_and_what_did_not(self):
        def solve(previous_failures):
            return solution_with([
                Check('Time of flight by two routes', 2.6, 2.6, 's'),
                Check('Range by two routes', 40.03, 40.17, 'm'),
            ])

        result = verify(solve)
        note = result.honest_note()

        self.assertEqual(result.badge, 'Partially verified')
        self.assertIn('1 of 2 checks agreed', note)
        self.assertIn('range by two routes', note.lower())
        self.assertIn('teacher', note)

    def test_a_false_claim_alone_stops_it_being_verified(self):
        """Right numbers and a wrong sentence is not a verified answer."""
        solution = projectile_on_incline(u=24, launch_deg=50, slope_deg=20)

        result = verify(
            lambda failures: solution,
            answer_text='The path is symmetric about the peak.',
        )

        self.assertTrue(solution.verified)
        self.assertFalse(result.fully_verified)
        self.assertEqual(result.badge, 'Partially verified')
        self.assertIn('statement', result.honest_note())

    def test_a_missing_curve_stops_it_being_verified(self):
        solution = rc_circuit(capacitance=470e-6, resistance=2200.0, emf=9.0)
        solution.curves.pop('discharging')

        result = verify(lambda failures: solution, required_curves=['charging', 'discharging'])

        self.assertFalse(result.fully_verified)
        self.assertIn('chart', result.honest_note())

    def test_the_student_never_sees_a_number_for_confidence(self):
        """A percentage invites a judgement the student cannot make."""
        result = verify(lambda failures: solution_with([Check('a', 1.0, 2.0)]))

        self.assertNotIn(str(result.confidence), result.badge)
        self.assertNotIn('%', result.honest_note())
        self.assertIn(result.badge, ('Verified', 'Partially verified', 'Not verified'))


class ConfidenceTests(SimpleTestCase):
    def test_everything_agreeing_scores_full(self):
        result = verify(lambda failures: solution_with([Check('a', 1.0, 1.0), Check('b', 2.0, 2.0)]))

        self.assertEqual(result.confidence, 1.0)

    def test_a_failed_check_lowers_it(self):
        result = verify(lambda failures: solution_with([Check('a', 1.0, 1.0), Check('b', 1.0, 2.0)]))

        self.assertLess(result.confidence, 1.0)
        self.assertGreater(result.confidence, 0.0)

    def test_a_solver_that_could_not_run_scores_zero(self):
        def solve(previous_failures):
            raise RuntimeError('no')

        self.assertEqual(verify(solve).confidence, 0.0)

    def test_needing_a_repair_is_remembered_even_when_it_worked(self):
        state = {'n': 0}

        def solve(previous_failures):
            state['n'] += 1
            if state['n'] == 1:
                return solution_with([Check('a', 1.0, 2.0)])
            return solution_with([Check('a', 1.0, 1.0)])

        result = verify(solve)

        self.assertTrue(result.fully_verified)
        self.assertLess(result.confidence, 1.0)


class LoggingTests(SimpleTestCase):
    def test_the_log_line_carries_no_student_data(self):
        solution = projectile_on_incline(u=24, launch_deg=50, slope_deg=20)
        result = verify(lambda failures: solution, answer_text='The path is symmetric about the peak.')

        line = result.log_line()

        self.assertIn('attempts=', line)
        self.assertIn('confidence=', line)
        for leak in ('symmetric', 'student', '@'):
            self.assertNotIn(leak, line)
