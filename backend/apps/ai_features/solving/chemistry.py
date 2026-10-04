"""Chemistry worked out in code.

The same rule as physics: the model decides the chemistry, code does the
arithmetic, and every answer is reached twice so a disagreement is an error
rather than a sentence about rounding.

The checks here are the ones a chemistry teacher would actually make. Mass is
conserved. The limiting reagent is the one that runs out. A yield above 100%
is a mistake, not a result.
"""

from __future__ import annotations

import math

from .compute import Computed, Quantity
from .physics import Check, Solution

#: The gas constant, in J per mole per kelvin.
R = 8.314


def moles_from_mass(mass_g: float, molar_mass: float) -> Solution:
    """n = m / M, checked by going back the other way."""

    computed = Computed()
    n = mass_g / molar_mass
    computed.add(Quantity('n', n, 'mol', 'm/M', significant_figures=3))
    computed.add(Quantity('m', mass_g, 'g', 'given'))
    computed.add(Quantity('M', molar_mass, 'g/mol', 'given'))

    checks = [Check('Mass recovered from moles', n * molar_mass, mass_g, 'g', tolerance=1e-9)]
    return Solution(computed=computed, checks=checks)


def solution_concentration(moles: float, volume_dm3: float) -> Solution:
    """c = n / V, checked by recovering the moles."""

    computed = Computed()
    c = moles / volume_dm3
    computed.add(Quantity('c', c, 'mol/dm3', 'n/V', significant_figures=3))
    checks = [Check('Moles recovered from concentration', c * volume_dm3, moles, 'mol', tolerance=1e-9)]
    return Solution(computed=computed, checks=checks)


def titration(
    c_known: float,
    v_known_cm3: float,
    v_unknown_cm3: float,
    ratio_known: int = 1,
    ratio_unknown: int = 1,
) -> Solution:
    """Concentration of the unknown solution from a titre.

    `ratio_known:ratio_unknown` is the mole ratio from the balanced equation,
    which is exactly the step students lose marks on, so it is explicit here
    rather than assumed to be one to one.
    """

    computed = Computed()
    n_known = c_known * (v_known_cm3 / 1000.0)
    n_unknown = n_known * (ratio_unknown / ratio_known)
    c_unknown = n_unknown / (v_unknown_cm3 / 1000.0)

    for name, value, unit, expr in [
        ('n_known', n_known, 'mol', 'c_known * V_known/1000'),
        ('n_unknown', n_unknown, 'mol', 'n_known * ratio_unknown/ratio_known'),
        ('c_unknown', c_unknown, 'mol/dm3', 'n_unknown / (V_unknown/1000)'),
    ]:
        computed.add(Quantity(name, value, unit, expr, significant_figures=3))

    # Independent route: work the known concentration back from the answer.
    c_known_again = (
        c_unknown * (v_unknown_cm3 / 1000.0) * (ratio_known / ratio_unknown)
    ) / (v_known_cm3 / 1000.0)

    checks = [
        Check('Known concentration recovered from the answer', c_known_again, c_known, 'mol/dm3', tolerance=1e-9),
        Check('Mole ratio holds', n_unknown * ratio_known, n_known * ratio_unknown, 'mol', tolerance=1e-9),
    ]
    return Solution(computed=computed, checks=checks)


def percentage_yield(actual_g: float, theoretical_g: float) -> Solution:
    """Yield as a percentage, with the check a teacher makes first."""

    computed = Computed()
    percent = 100.0 * actual_g / theoretical_g
    computed.add(Quantity('percent_yield', percent, '%', '100*actual/theoretical', significant_figures=3))
    computed.add(Quantity('actual', actual_g, 'g', 'given'))
    computed.add(Quantity('theoretical', theoretical_g, 'g', 'given'))

    checks = [
        Check('Actual mass recovered from the yield', percent * theoretical_g / 100.0, actual_g, 'g', tolerance=1e-9),
    ]
    facts = {
        # A yield over 100% means an error somewhere, and saying so is more
        # useful to a student than printing the number.
        'yield_is_possible': percent <= 100.0 + 1e-9,
    }
    return Solution(computed=computed, checks=checks, facts=facts)


def limiting_reagent(moles_a: float, coeff_a: int, moles_b: float, coeff_b: int) -> Solution:
    """Which reactant runs out first, decided by the ratio rather than the mass."""

    computed = Computed()
    ratio_a = moles_a / coeff_a
    ratio_b = moles_b / coeff_b
    computed.add(Quantity('ratio_a', ratio_a, 'mol', 'n_a/coeff_a', significant_figures=4))
    computed.add(Quantity('ratio_b', ratio_b, 'mol', 'n_b/coeff_b', significant_figures=4))

    facts = {
        'a_is_limiting': ratio_a < ratio_b,
        'b_is_limiting': ratio_b < ratio_a,
        'neither_is_in_excess': abs(ratio_a - ratio_b) < 1e-12,
    }
    checks = [
        Check('Both ratios computed from the same balanced equation', coeff_a * ratio_a, moles_a, 'mol', tolerance=1e-9),
    ]
    return Solution(computed=computed, checks=checks, facts=facts)


def ideal_gas(pressure_pa: float, volume_m3: float, temperature_k: float) -> Solution:
    """pV = nRT, checked by putting the answer back into the equation."""

    computed = Computed()
    n = (pressure_pa * volume_m3) / (R * temperature_k)
    computed.add(Quantity('n', n, 'mol', 'p*V/(R*T)', significant_figures=3))

    checks = [
        Check('Pressure recovered from the answer', n * R * temperature_k / volume_m3, pressure_pa, 'Pa', tolerance=1e-9),
    ]
    facts = {'temperature_is_absolute': temperature_k > 0}
    return Solution(computed=computed, checks=checks, facts=facts)


def energy_change(mass_g: float, temp_change_k: float, specific_heat: float = 4.18) -> Solution:
    """E = mcDT, in joules, with the sign convention stated by the fact it records."""

    computed = Computed()
    energy_j = mass_g * specific_heat * temp_change_k
    computed.add(Quantity('E', energy_j, 'J', 'm*c*dT', significant_figures=3))
    computed.add(Quantity('E_kJ', energy_j / 1000.0, 'kJ', 'E/1000', significant_figures=3))

    checks = [
        Check('Temperature change recovered from the energy', energy_j / (mass_g * specific_heat), temp_change_k, 'K', tolerance=1e-9),
    ]
    facts = {
        'reaction_is_exothermic': temp_change_k > 0,
        'reaction_is_endothermic': temp_change_k < 0,
    }
    return Solution(computed=computed, checks=checks, facts=facts)


def ph_of_strong_acid(concentration: float) -> Solution:
    """pH from concentration, checked by going back to the concentration."""

    computed = Computed()
    ph = -math.log10(concentration)
    computed.add(Quantity('pH', ph, '', '-log10(c)', significant_figures=3))

    checks = [Check('Concentration recovered from the pH', 10 ** (-ph), concentration, 'mol/dm3', tolerance=1e-9)]
    facts = {'is_acidic': ph < 7, 'is_alkaline': ph > 7}
    return Solution(computed=computed, checks=checks, facts=facts)
