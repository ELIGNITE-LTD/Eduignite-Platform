"""The quantitative parts of Biology, worked out in code.

Biology is mostly prose, and the universal gate covers that. But the places
where it carries numbers are exactly the places students lose marks and a
tutor can be confidently wrong: magnification with mismatched units, a
genetics ratio stated without the grid behind it, a rate quoted without saying
what it is per.
"""

from __future__ import annotations

import math
from itertools import product

from .compute import Computed, Quantity
from .physics import Check, Solution

#: Every unit a question might give a size in, as metres.
_UNITS = {'m': 1.0, 'mm': 1e-3, 'um': 1e-6, 'µm': 1e-6, 'nm': 1e-9}


def _to_metres(value: float, unit: str) -> float:
    factor = _UNITS.get(unit.strip().lower())
    if factor is None:
        raise ValueError(f'Unknown unit {unit!r}.')
    return value * factor


def magnification(image_size: float, image_unit: str, actual_size: float, actual_unit: str) -> Solution:
    """Magnification = image size / actual size, both converted first.

    The mark is usually lost to units, not to the division, so the conversion
    happens here rather than being left to whoever is reading.
    """

    computed = Computed()
    image_m = _to_metres(image_size, image_unit)
    actual_m = _to_metres(actual_size, actual_unit)
    m = image_m / actual_m

    computed.add(Quantity('magnification', m, 'x', 'image/actual', significant_figures=3))
    computed.add(Quantity('image_m', image_m, 'm', f'{image_size} {image_unit}'))
    computed.add(Quantity('actual_m', actual_m, 'm', f'{actual_size} {actual_unit}'))

    checks = [
        Check('Actual size recovered from the magnification', image_m / m, actual_m, 'm', tolerance=1e-9),
    ]
    facts = {'image_is_magnified': m > 1, 'image_is_reduced': m < 1}
    return Solution(computed=computed, checks=checks, facts=facts)


def monohybrid_cross(parent_one: str, parent_two: str) -> Solution:
    """A Punnett square worked out rather than recalled.

    Genotypes are two letters, for example 'Aa'. The ratio comes from counting
    the grid, so a stated 3:1 is a count and not a memory.
    """

    computed = Computed()
    gametes_one = list(parent_one)
    gametes_two = list(parent_two)

    offspring = [''.join(sorted(pair, key=lambda c: (c.lower(), c.islower())))
                 for pair in product(gametes_one, gametes_two)]

    counts: dict[str, int] = {}
    for genotype in offspring:
        counts[genotype] = counts.get(genotype, 0) + 1

    dominant = parent_one[0].upper()
    showing_dominant = sum(n for g, n in counts.items() if dominant in g)
    showing_recessive = len(offspring) - showing_dominant

    computed.add(Quantity('total_offspring', float(len(offspring)), '', 'grid size'))
    computed.add(Quantity('dominant_phenotype', float(showing_dominant), '', 'counted from the grid'))
    computed.add(Quantity('recessive_phenotype', float(showing_recessive), '', 'counted from the grid'))
    for genotype, count in sorted(counts.items()):
        computed.add(Quantity(f'genotype_{genotype}', float(count), '', 'counted from the grid'))

    checks = [
        Check('Every square is accounted for', float(showing_dominant + showing_recessive), float(len(offspring)), '', tolerance=1e-12),
        Check('Genotype counts sum to the grid', float(sum(counts.values())), float(len(offspring)), '', tolerance=1e-12),
    ]
    facts = {
        'ratio_is_3_to_1': showing_dominant == 3 and showing_recessive == 1,
        'ratio_is_1_to_1': showing_dominant == showing_recessive,
        'all_offspring_show_dominant': showing_recessive == 0,
    }
    return Solution(computed=computed, checks=checks, facts=facts)


def surface_area_to_volume(side: float) -> Solution:
    """A cube's ratio, for the usual question about why cells stay small."""

    computed = Computed()
    area = 6 * side ** 2
    volume = side ** 3
    ratio = area / volume

    computed.add(Quantity('surface_area', area, 'units^2', '6*s**2', significant_figures=3))
    computed.add(Quantity('volume', volume, 'units^3', 's**3', significant_figures=3))
    computed.add(Quantity('ratio', ratio, ':1', 'area/volume', significant_figures=3))

    checks = [
        Check('Ratio recovered from area and volume', area / volume, ratio, ':1', tolerance=1e-12),
        Check('Ratio equals 6 over the side length', ratio, 6.0 / side, ':1', tolerance=1e-12),
    ]
    facts = {'ratio_falls_as_the_cell_grows': True}
    return Solution(computed=computed, checks=checks, facts=facts)


def reaction_rate(quantity: float, time_s: float, unit: str = 'cm3') -> Solution:
    """Rate as quantity over time, with the unit said out loud."""

    computed = Computed()
    rate = quantity / time_s
    computed.add(Quantity('rate', rate, f'{unit}/s', 'quantity/time', significant_figures=3))
    checks = [Check('Quantity recovered from the rate', rate * time_s, quantity, unit, tolerance=1e-9)]
    return Solution(computed=computed, checks=checks)


def population_growth(initial: float, rate_per_period: float, periods: float) -> Solution:
    """Exponential growth, checked against repeated multiplication."""

    computed = Computed()
    final = initial * (1 + rate_per_period) ** periods
    computed.add(Quantity('final_population', final, '', 'N0*(1+r)**t', significant_figures=4))

    stepwise = initial
    whole = int(periods)
    for _ in range(whole):
        stepwise *= (1 + rate_per_period)
    if periods != whole:
        stepwise *= (1 + rate_per_period) ** (periods - whole)

    checks = [
        Check('Formula against repeated multiplication', final, stepwise, '', tolerance=1e-9),
        Check('Initial population recovered', final / (1 + rate_per_period) ** periods, initial, '', tolerance=1e-9),
    ]
    facts = {
        'population_is_growing': rate_per_period > 0,
        'population_is_falling': rate_per_period < 0,
    }
    return Solution(computed=computed, checks=checks, facts=facts)


def water_potential(solute_potential: float, pressure_potential: float) -> Solution:
    """Water potential, where the sign convention is the whole question."""

    computed = Computed()
    total = solute_potential + pressure_potential
    computed.add(Quantity('water_potential', total, 'kPa', 'solute + pressure', significant_figures=3))

    checks = [
        Check('Solute potential recovered', total - pressure_potential, solute_potential, 'kPa', tolerance=1e-9),
    ]
    facts = {
        # Pure water is the maximum at zero, so anything with solute is below it.
        'potential_is_negative_or_zero': total <= 1e-12,
        'water_moves_in': total < 0,
    }
    return Solution(computed=computed, checks=checks, facts=facts)
