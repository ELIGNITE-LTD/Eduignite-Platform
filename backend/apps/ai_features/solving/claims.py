"""Checking what an answer asserts, not only what it calculates.

The worst failure in the physics set was not a wrong number. Every number was
right. What was wrong was a sentence: the sketch description said the maximum
height sits at the midpoint of the slope range, which is false, and it sat
directly beneath working that proved otherwise.

No arithmetic check catches that, because the arithmetic was correct. The
sentence has to be checked against what the solution actually computed.

So a solution records facts - "the peak is at half the range: False" - and this
reads the prose for claims about those facts and compares the two. Three
outcomes matter:

  * the answer asserts something the solution computed to be false,
  * the answer asserts something the solution never established at all,
  * the answer says a thing and its opposite.

The vocabulary is deliberately narrow. A linter that tried to understand every
sentence would flag good writing constantly; this only reads claims it knows
how to settle.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .lint import LintProblem, _prose_only


@dataclass(frozen=True)
class ClaimPattern:
    """A sentence shape, the fact that settles it, and what it asserts."""

    pattern: str
    fact: str
    asserts: bool
    #: Shown when the claim is wrong, so a repair attempt knows what to fix.
    correction: str = ''


#: Claims the pipeline knows how to settle. Each names a fact a subject module
#: records, so adding a claim means adding the computation that decides it.
CLAIM_PATTERNS: tuple[ClaimPattern, ...] = (
    # The projectile-on-a-slope claim that was wrong.
    ClaimPattern(
        r'(symmetric|symmetrical)\s+(about|around)\s+(the\s+)?(peak|maximum|midpoint|highest point)',
        'motion_along_slope_is_symmetric', True,
        'On a slope the motion along the slope is not symmetric, because gravity '
        'has a component along it. The peak is past the midpoint of the range.',
    ),
    ClaimPattern(
        r'(peak|maximum|highest point)[^.]{0,40}\b(at|is at)\s+(half|the midpoint|the mid-point|R/2)',
        'peak_is_at_half_range', True,
        'The peak is not at half the range on a slope; it is further up.',
    ),
    ClaimPattern(
        r'\bhalfway (along|up) the (slope|range)\b',
        'peak_is_at_half_range', True,
        'The peak is not halfway along the slope.',
    ),

    # Piecewise motion.
    ClaimPattern(
        r'\b(there is|has)\s+(a\s+)?(point of )?inflection\b',
        'displacement_has_inflection', True,
        'There is no point of inflection unless the acceleration changes sign.',
    ),
    ClaimPattern(
        r'\b(no|without a)\s+(point of )?inflection\b',
        'displacement_has_inflection', False,
    ),
    ClaimPattern(
        r'\bacceleration changes sign\b',
        'acceleration_changes_sign', True,
    ),

    # Energy and conservation.
    ClaimPattern(
        r'\bhalf (of )?the (supplied |total )?energy is (stored|lost|dissipated)\b',
        'half_the_supplied_energy_is_lost_in_the_resistor', True,
    ),

    # Chemistry.
    ClaimPattern(
        r'\b(the )?yield (is|of)[^.]{0,20}\b(over|above|more than) 100\s*%',
        'yield_is_possible', False,
    ),
    ClaimPattern(r'\breaction is exothermic\b', 'reaction_is_exothermic', True),
    ClaimPattern(r'\breaction is endothermic\b', 'reaction_is_endothermic', True),
    ClaimPattern(r'\bsolution is acidic\b', 'is_acidic', True),
    ClaimPattern(r'\bsolution is alkaline\b', 'is_alkaline', True),

    # Biology.
    ClaimPattern(r'\bratio (is|of) 3\s*[:to]+\s*1\b', 'ratio_is_3_to_1', True),
    ClaimPattern(r'\bratio (is|of) 1\s*[:to]+\s*1\b', 'ratio_is_1_to_1', True),
    ClaimPattern(r'\bimage is magnified\b', 'image_is_magnified', True),
)


def audit_claims(text: str, facts: dict[str, bool]) -> list[LintProblem]:
    """Compare what the answer asserts with what the solution established.

    A claim the solution computed to be false is an error. A claim about
    something the solution never established is unsupported, which is a
    different failure and is reported as one: the answer may be right, but
    nothing in the pipeline knows it.
    """

    prose = _prose_only(text)
    problems: list[LintProblem] = []

    for claim in CLAIM_PATTERNS:
        match = re.search(claim.pattern, prose, re.IGNORECASE)
        if not match:
            continue

        if claim.fact not in facts:
            problems.append(
                LintProblem(
                    kind='unsupported-claim',
                    detail=f'the answer claims {match.group(0)!r}, which nothing in the solution established',
                    evidence=match.group(0),
                )
            )
            continue

        if facts[claim.fact] != claim.asserts:
            detail = f'the answer claims {match.group(0)!r}, which the solution computed to be false'
            if claim.correction:
                detail = f'{detail}. {claim.correction}'
            problems.append(LintProblem(kind='false-claim', detail=detail, evidence=match.group(0)))

    return problems


def claims_made_in(text: str) -> list[str]:
    """Which known claims an answer makes, for logging and for the repair loop."""

    prose = _prose_only(text)
    return [
        claim.fact
        for claim in CLAIM_PATTERNS
        if re.search(claim.pattern, prose, re.IGNORECASE)
    ]
