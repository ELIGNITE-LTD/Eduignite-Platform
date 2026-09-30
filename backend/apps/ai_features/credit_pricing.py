"""How much AI work costs, in credits and in money.

Pure arithmetic over the configuration: nothing here reads or writes a balance.
Two questions are answered:

  * **Before** a request: roughly how many credits will this take? Worked out
    from the size of what is being sent, how long an answer this kind of
    question usually needs, the feature and the model.
  * **After** a request: what did it actually take? Worked out from the tokens
    the provider reports, which is what the account is charged.

A simple question sends little and gets a short answer, so it costs a few
credits. A hard problem, a long document or a whole exam paper sends and
receives far more, so it costs more. Nothing is priced per question.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from decimal import ROUND_CEILING, Decimal

#: Roughly how many characters make one token, for text that has not been sent
#: yet. English averages about four; French and mathematics run shorter, so
#: this leans slightly towards over-estimating.
CHARS_PER_TOKEN = 3.6

#: A reasoning model thinks before it answers, and that thinking is billed as
#: output. At the low effort the platform asks for, this is typical.
REASONING_OVERHEAD_TOKENS = 150

#: The chat is priced as its own feature even though it is stored with the
#: request type `general`.
CHAT_FEATURE = 'chat'
#: A chat question sent with one or more photos of the question.
IMAGE_FEATURE = 'image_question'

# How long an answer different kinds of chat question tend to need, in tokens.
COMPLEXITY_OUTPUT_TOKENS = {
    'simple': 350,
    'normal': 700,
    'detailed': 1200,
    'complex': 1800,
}

_DETAILED_WORDS = (
    'step by step', 'step-by-step', 'in detail', 'detailed', 'with examples', 'examples',
    'analogy', 'compare', 'difference between', 'advantages and disadvantages', 'summarize',
    'summarise', 'summary', 'notes', 'outline', 'essay', 'etape par etape', 'en detail',
    'exemples', 'resume', 'comparer',
)
_COMPLEX_WORDS = (
    'solve', 'prove', 'derive', 'calculate', 'integrate', 'differentiate', 'simplify',
    'factorise', 'factorize', 'evaluate', 'find the value', 'show that', 'lesson plan',
    'full lesson', 'course', 'scheme of work', 'quiz', 'exercises', 'resoudre', 'demontrer',
    'calculer', 'montrer que',
)
_EXPLAIN_WORDS = ('explain', 'why', 'how does', 'how do', 'describe', 'expliquer', 'pourquoi', 'comment')
_MATHS_PATTERN = re.compile(r'[=^√∫∑π]|\\frac|\\sqrt|\d\s*[x×*/]\s*\d|\bx\s*[+\-=]')


def feature_key(request_type: str | None) -> str:
    """The pricing name of an AI request type."""
    value = (request_type or '').strip()
    return CHAT_FEATURE if value in ('', 'general') else value


def tokens_for_text(text: str | None) -> int:
    if not text:
        return 0
    return int(math.ceil(len(text) / CHARS_PER_TOKEN))


def classify_question(message: str | None) -> str:
    """simple / normal / detailed / complex, from the wording of a question.

    Only ever used to estimate. The charge itself follows the real length of
    the answer, so a wrong guess here costs nobody anything.
    """
    text = (message or '').lower()
    words = len(text.split())
    if any(word in text for word in _COMPLEX_WORDS) or _MATHS_PATTERN.search(text):
        return 'complex'
    if any(word in text for word in _DETAILED_WORDS) or words > 80:
        return 'detailed'
    if any(word in text for word in _EXPLAIN_WORDS) or words > 25:
        return 'normal'
    return 'simple'


def _decimal(value, default='0') -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:  # noqa: BLE001 - a bad config value falls back, never crashes a request
        return Decimal(default)


def _multiplier(table, key: str | None) -> Decimal:
    if not isinstance(table, dict) or not key:
        return Decimal('1')
    if key in table:
        return _decimal(table[key], '1')
    return Decimal('1')


@dataclass
class Usage:
    """What a request actually consumed, as the provider reported it."""

    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    model: str = ''
    documents: int = 0
    images: int = 0
    cached_response: bool = False


@dataclass
class Estimate:
    credits: int
    input_tokens: int
    output_tokens: int
    complexity: str = ''
    feature: str = ''
    model: str = ''
    breakdown: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            'credits': self.credits,
            'input_tokens': self.input_tokens,
            'output_tokens': self.output_tokens,
            'complexity': self.complexity,
            'feature': self.feature,
        }


def credits_for_usage(config, feature: str, usage: Usage) -> int:
    """The credits a piece of AI work is worth under the current rules."""
    if usage.cached_response:
        return int(config.cached_response_credits)

    cached = min(max(usage.cached_tokens, 0), max(usage.input_tokens, 0))
    fresh_input = max(usage.input_tokens - cached, 0)
    raw = (
        Decimal(fresh_input) / 1000 * _decimal(config.credits_per_1k_input_tokens)
        + Decimal(cached) / 1000 * _decimal(config.credits_per_1k_cached_input_tokens)
        + Decimal(max(usage.output_tokens, 0)) / 1000 * _decimal(config.credits_per_1k_output_tokens)
    )
    raw *= _multiplier(config.feature_multipliers, feature)
    raw *= _multiplier(config.model_multipliers, usage.model)
    raw += Decimal(max(usage.documents, 0) * int(config.per_document_credits))
    raw += Decimal(max(usage.images, 0) * int(getattr(config, 'per_image_credits', 0) or 0))

    credits = int(raw.to_integral_value(rounding=ROUND_CEILING))
    return max(credits, int(config.minimum_charge))


def provider_cost(config, usage: Usage) -> Decimal:
    """What the provider charged us for this work, in FCFA."""
    if usage.cached_response:
        return Decimal('0')
    rates = (config.provider_costs or {}).get(usage.model) if isinstance(config.provider_costs, dict) else None
    if not isinstance(rates, dict):
        return Decimal('0')
    cached = min(max(usage.cached_tokens, 0), max(usage.input_tokens, 0))
    fresh_input = max(usage.input_tokens - cached, 0)
    million = Decimal(1_000_000)
    cost = (
        Decimal(fresh_input) * _decimal(rates.get('input_per_million')) / million
        + Decimal(cached) * _decimal(rates.get('cached_input_per_million', rates.get('input_per_million'))) / million
        + Decimal(max(usage.output_tokens, 0)) * _decimal(rates.get('output_per_million')) / million
    )
    return cost.quantize(Decimal('0.0001'))


def estimate(
    config,
    feature: str,
    *,
    system_prompt_tokens: int = 0,
    input_text: str = '',
    input_tokens: int | None = None,
    max_output_tokens: int | None = None,
    expected_output_tokens: int | None = None,
    documents: int = 0,
    images: int = 0,
    model: str = '',
    question: str | None = None,
) -> Estimate:
    """Roughly what a request will cost, before any of it is sent.

    `question` is the person's own words, for the chat: how it is phrased
    decides how long an answer to expect. Other features say how long their
    answers usually are, through `feature_estimates` in the configuration.
    """
    profile = {}
    if isinstance(config.feature_estimates, dict):
        profile = config.feature_estimates.get(feature) or {}

    sent = input_tokens if input_tokens is not None else tokens_for_text(input_text)
    if not sent and profile.get('input_tokens'):
        sent = int(profile['input_tokens'])
    sent += max(system_prompt_tokens, 0)
    # A picture is read as tokens too, before a word of the answer is written.
    sent += max(images, 0) * int(getattr(config, 'estimated_tokens_per_image', 0) or 0)

    complexity = ''
    if expected_output_tokens is None:
        if feature in (CHAT_FEATURE, IMAGE_FEATURE):
            complexity = classify_question(question if question is not None else input_text)
            if images and complexity in ('simple', 'normal'):
                # The question is in the picture, not in the words typed
                # beside it, so assume it needs working through.
                complexity = 'detailed'
            expected_output_tokens = COMPLEXITY_OUTPUT_TOKENS[complexity]
        else:
            expected_output_tokens = int(profile.get('output_tokens') or 1000)
    expected_output_tokens += REASONING_OVERHEAD_TOKENS
    if max_output_tokens:
        expected_output_tokens = min(expected_output_tokens, int(max_output_tokens))

    credits = credits_for_usage(
        config,
        feature,
        Usage(input_tokens=sent, output_tokens=expected_output_tokens, model=model, documents=documents, images=images),
    )
    return Estimate(
        credits=credits,
        input_tokens=sent,
        output_tokens=expected_output_tokens,
        complexity=complexity,
        feature=feature,
        model=model,
    )


def price_for_credits(config, credits: int) -> int:
    """The FCFA price of a number of credits, rounded up to a whole franc."""
    if not config.purchases_enabled:
        raise ValueError('Credit purchases are not open yet.')
    price = Decimal(int(credits)) * _decimal(config.price_per_credit)
    return int(price.to_integral_value(rounding=ROUND_CEILING))
