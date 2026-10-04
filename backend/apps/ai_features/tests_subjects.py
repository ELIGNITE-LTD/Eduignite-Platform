"""The gate holds in every subject, not only the ones with numbers in them.

The reported failures were physics, but none of them were about physics. A
History essay can leak the model's thinking, a Biology answer can contradict
itself, a Literature answer can quote a study nobody wrote, and any subject at
all can quietly skip part (c).

These check that the same gate catches the same faults wherever they appear,
and that the subjects with arithmetic get their arithmetic checked too.
"""

from django.test import SimpleTestCase

from apps.ai_features.solving import biology, chemistry
from apps.ai_features.solving.compute import Computed, Quantity
from apps.ai_features.solving.prose import (
    check_answers_the_question,
    check_contradiction,
    check_hedging,
    check_placeholders,
    check_sources,
)
from apps.ai_features.solving.subjects import (
    command_words_in,
    review_answer,
    sub_parts_in,
    subject_for,
)


def close(actual, expected, tolerance=5e-3):
    return abs(actual - expected) <= tolerance * max(abs(expected), 1e-12)


# ── The gate is universal ───────────────────────────────────────────────────

class EverySubjectIsGatedTests(SimpleTestCase):
    """The same leaked thinking is caught whatever the subject."""

    LEAKED = "Wait, let me reconsider. Actually, the answer is different."

    def test_scratch_reasoning_is_caught_in_every_subject(self):
        for subject in ('Physics', 'History', 'Literature in English', 'Biology',
                        'Chemistry', 'Geography', 'Citizenship', 'French',
                        'Computer Science', 'Mathematics', 'Religious Studies'):
            with self.subTest(subject=subject):
                review = review_answer(self.LEAKED, subject_name=subject)
                self.assertFalse(review.passed)
                self.assertIn('scratch', {p.kind for p in review.problems})

    def test_an_unknown_subject_is_still_gated(self):
        """A subject nobody mapped must not become a way round the gate."""
        review = review_answer(self.LEAKED, subject_name='Food and Nutrition')
        self.assertFalse(review.passed)

    def test_no_subject_at_all_is_still_gated(self):
        self.assertFalse(review_answer(self.LEAKED).passed)

    def test_a_missing_sub_part_is_caught_in_an_essay_subject(self):
        question = 'Explain (a) the causes and (b) the consequences of the event.'
        answer = '### (a) Causes\nBecause of trade routes, this happened.'
        review = review_answer(answer, question=question, subject_name='History')
        self.assertIn('completeness', {p.kind for p in review.problems})

    def test_a_good_history_answer_passes(self):
        question = 'Explain (a) one cause and (b) one consequence.'
        answer = (
            '### (a) Cause\nThe treaty was signed in 1919 because the war had ended '
            'and the powers wanted terms settled.\n'
            '### (b) Consequence\nThis means the borders were redrawn, which caused '
            'lasting resentment.'
        )
        review = review_answer(answer, question=question, subject_name='History')
        self.assertTrue(review.passed, review.summary())


class SubjectMatchingTests(SimpleTestCase):
    def test_free_text_subject_names_find_their_module(self):
        for name, expected in [
            ('Physics', 'physics'), ('PHYSICS (A Level)', 'physics'), ('Physique', 'physics'),
            ('Chemistry', 'chemistry'), ('Chimie', 'chemistry'),
            ('Biology', 'biology'), ('Further Maths', 'mathematics'),
            ('Literature in English', 'literature'), ('History', 'history'),
            ('Economics', 'economics'), ('Computer Science', 'computer-science'),
        ]:
            with self.subTest(name=name):
                self.assertEqual(subject_for(name).key, expected)

    def test_an_unknown_subject_falls_back_to_general(self):
        self.assertEqual(subject_for('Home Economics and Catering').key, 'general')
        self.assertEqual(subject_for(None).key, 'general')

    def test_essay_subjects_are_not_marked_quantitative(self):
        for name in ('History', 'Literature in English', 'Religious Studies'):
            self.assertFalse(subject_for(name).quantitative, name)

    def test_science_subjects_are_quantitative(self):
        for name in ('Physics', 'Chemistry', 'Biology', 'Mathematics'):
            self.assertTrue(subject_for(name).quantitative, name)


class QuestionReadingTests(SimpleTestCase):
    def test_sub_parts_are_read_from_the_question(self):
        self.assertEqual(sub_parts_in('State (a) one, (b) two and (c) three.'), ['a', 'b', 'c'])

    def test_command_words_are_found_in_both_languages(self):
        self.assertIn('evaluate', command_words_in('Evaluate the impact of this policy.'))
        self.assertIn('expliquez', command_words_in('Expliquez le role de la plante.'))


# ── Prose checks, the essay equivalent of an unverified number ──────────────

class ProseGateTests(SimpleTestCase):
    def test_a_guess_written_as_an_answer_is_caught(self):
        for text in ('I think the answer is 1919.',
                     'It is probably caused by deforestation.',
                     'The population is something like 2 million.'):
            with self.subTest(text=text):
                self.assertTrue(check_hedging(text), text)

    def test_a_source_nobody_can_look_up_is_caught(self):
        for text in ('According to a study, rates fell.',
                     'Researchers have shown this is true.',
                     'It is widely believed that the policy worked.'):
            with self.subTest(text=text):
                self.assertTrue(check_sources(text), text)

    def test_a_named_source_passes(self):
        self.assertEqual(check_sources('The 1919 Treaty of Versailles set these terms.'), [])

    def test_an_answer_that_contradicts_itself_is_caught(self):
        """The physics set proved the motion was not symmetric, then said it was."""
        text = (
            'The working shows the motion along the slope is not symmetric. '
            'For the sketch, note that the path is symmetric about the peak.'
        )
        self.assertTrue(check_contradiction(text))

    def test_a_consistent_answer_passes(self):
        text = 'The motion along the slope is not symmetric, so the peak is past the midpoint.'
        self.assertEqual(check_contradiction(text), [])

    def test_placeholders_and_self_reference_are_caught(self):
        for text in ('The answer is [insert value here].',
                     'As an AI, I cannot be certain.',
                     'TODO: finish this part.'):
            with self.subTest(text=text):
                self.assertTrue(check_placeholders(text), text)

    def test_a_question_that_says_compare_must_compare(self):
        problems = check_answers_the_question('Photosynthesis happens in the leaf.', ['compare'])
        self.assertTrue(problems)

    def test_an_answer_that_really_compares_passes(self):
        text = 'Mitosis produces two identical cells, whereas meiosis produces four different ones.'
        self.assertEqual(check_answers_the_question(text, ['compare']), [])

    def test_a_question_that_says_evaluate_must_judge(self):
        self.assertTrue(check_answers_the_question('The policy raised taxes.', ['evaluate']))
        self.assertEqual(
            check_answers_the_question(
                'The policy raised revenue. However, it hurt the poorest. Overall it failed.',
                ['evaluate'],
            ),
            [],
        )


# ── Chemistry ───────────────────────────────────────────────────────────────

class ChemistryTests(SimpleTestCase):
    def test_moles_from_mass(self):
        s = chemistry.moles_from_mass(mass_g=12.0, molar_mass=24.0)
        self.assertTrue(close(s.computed.value('n'), 0.5))
        self.assertTrue(s.verified)

    def test_titration_with_a_mole_ratio(self):
        """25.0 cm3 of 0.100 mol/dm3 NaOH against 20.0 cm3 of H2SO4, ratio 2:1."""
        s = chemistry.titration(c_known=0.100, v_known_cm3=25.0, v_unknown_cm3=20.0,
                                ratio_known=2, ratio_unknown=1)
        self.assertTrue(close(s.computed.value('n_known'), 2.5e-3))
        self.assertTrue(close(s.computed.value('c_unknown'), 0.0625))
        self.assertTrue(s.verified, [c.sentence() for c in s.failures()])

    def test_a_one_to_one_titration(self):
        s = chemistry.titration(c_known=0.100, v_known_cm3=25.0, v_unknown_cm3=25.0)
        self.assertTrue(close(s.computed.value('c_unknown'), 0.100))

    def test_a_yield_over_one_hundred_percent_is_flagged(self):
        s = chemistry.percentage_yield(actual_g=12.0, theoretical_g=10.0)
        self.assertFalse(s.facts['yield_is_possible'])

    def test_a_normal_yield_is_fine(self):
        s = chemistry.percentage_yield(actual_g=8.0, theoretical_g=10.0)
        self.assertTrue(close(s.computed.value('percent_yield'), 80.0))
        self.assertTrue(s.facts['yield_is_possible'])

    def test_the_limiting_reagent_is_decided_by_ratio_not_mass(self):
        s = chemistry.limiting_reagent(moles_a=2.0, coeff_a=2, moles_b=1.5, coeff_b=1)
        self.assertTrue(s.facts['a_is_limiting'])
        self.assertFalse(s.facts['b_is_limiting'])

    def test_ideal_gas(self):
        s = chemistry.ideal_gas(pressure_pa=101325.0, volume_m3=0.0224, temperature_k=273.0)
        self.assertTrue(close(s.computed.value('n'), 1.0, 2e-2), s.computed.value('n'))
        self.assertTrue(s.verified)

    def test_energy_change_records_whether_it_is_exothermic(self):
        s = chemistry.energy_change(mass_g=100.0, temp_change_k=5.0)
        self.assertTrue(close(s.computed.value('E'), 2090.0))
        self.assertTrue(s.facts['reaction_is_exothermic'])
        self.assertFalse(s.facts['reaction_is_endothermic'])

    def test_ph_of_a_strong_acid(self):
        s = chemistry.ph_of_strong_acid(0.01)
        self.assertTrue(close(s.computed.value('pH'), 2.0))
        self.assertTrue(s.facts['is_acidic'])
        self.assertTrue(s.verified)


# ── Biology ─────────────────────────────────────────────────────────────────

class BiologyTests(SimpleTestCase):
    def test_magnification_converts_units_first(self):
        """50 mm image of a 100 um specimen is 500x, not 0.5x."""
        s = biology.magnification(50, 'mm', 100, 'um')
        self.assertTrue(close(s.computed.value('magnification'), 500.0))
        self.assertTrue(s.verified)
        self.assertTrue(s.facts['image_is_magnified'])

    def test_a_monohybrid_cross_counts_the_grid(self):
        s = biology.monohybrid_cross('Aa', 'Aa')
        self.assertEqual(s.computed.value('dominant_phenotype'), 3)
        self.assertEqual(s.computed.value('recessive_phenotype'), 1)
        self.assertTrue(s.facts['ratio_is_3_to_1'])
        self.assertTrue(s.verified)

    def test_a_test_cross_gives_one_to_one(self):
        s = biology.monohybrid_cross('Aa', 'aa')
        self.assertTrue(s.facts['ratio_is_1_to_1'])
        self.assertFalse(s.facts['ratio_is_3_to_1'])

    def test_a_homozygous_dominant_cross_shows_no_recessive(self):
        s = biology.monohybrid_cross('AA', 'aa')
        self.assertTrue(s.facts['all_offspring_show_dominant'])

    def test_surface_area_to_volume_falls_as_the_cell_grows(self):
        small = biology.surface_area_to_volume(1.0)
        large = biology.surface_area_to_volume(4.0)
        self.assertGreater(small.computed.value('ratio'), large.computed.value('ratio'))
        self.assertTrue(small.verified and large.verified)

    def test_reaction_rate(self):
        s = biology.reaction_rate(quantity=24.0, time_s=30.0)
        self.assertTrue(close(s.computed.value('rate'), 0.8))
        self.assertTrue(s.verified)

    def test_population_growth_matches_repeated_multiplication(self):
        s = biology.population_growth(initial=1000.0, rate_per_period=0.1, periods=3)
        self.assertTrue(close(s.computed.value('final_population'), 1331.0))
        self.assertTrue(s.verified)

    def test_water_potential_sign_convention(self):
        s = biology.water_potential(solute_potential=-500.0, pressure_potential=200.0)
        self.assertTrue(close(s.computed.value('water_potential'), -300.0))
        self.assertTrue(s.facts['water_moves_in'])


# ── A quantitative subject still gets the numeric check ─────────────────────

class QuantitativeSubjectsKeepTheNumberCheckTests(SimpleTestCase):
    def setUp(self):
        self.computed = Computed()
        self.computed.add(Quantity('c', 0.0625, 'mol/dm3', significant_figures=3))

    def test_an_uncomputed_number_is_caught_in_chemistry(self):
        review = review_answer(
            'The concentration is 0.0810 mol/dm3.',
            question='Calculate the concentration.',
            subject_name='Chemistry',
            computed=self.computed,
        )
        self.assertIn('consistency', {p.kind for p in review.problems})

    def test_the_computed_number_passes(self):
        review = review_answer(
            'The concentration is 0.0625 mol/dm3.',
            question='Calculate the concentration.',
            subject_name='Chemistry',
            computed=self.computed,
        )
        self.assertTrue(review.passed, review.summary())

    def test_an_essay_subject_is_not_asked_to_match_computed_numbers(self):
        """Every correct date in a History essay would otherwise be rejected."""
        review = review_answer(
            'The treaty was signed in 1919 and revised in 1925.',
            question='Describe the treaty.',
            subject_name='History',
            computed=self.computed,
        )
        self.assertNotIn('consistency', {p.kind for p in review.problems})
