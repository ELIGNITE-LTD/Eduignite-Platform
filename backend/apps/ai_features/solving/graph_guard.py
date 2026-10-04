"""Charts checked, and where possible redrawn, before the answer is returned.

The chart failures all had the same shape: the model wrote the picture's
numbers itself, separately from the numbers it had just worked out. A
trajectory came out as a near-vertical line instead of a parabola, a discharge
curve was named in the legend with no line behind it, and a label sat on the
edge of the plot and was clipped.

Two things fix that, and this does both to every answer on its way out.

Where a graph describes a *function*, the points are sampled here, from the
expression, by the same evaluator that computes the answers. A curve can then
no longer disagree with the formula it is labelled with, because nobody typed
it. Points the model marked on that curve are checked against the function and
dropped if they are not on it.

Where a graph cannot be checked or cannot be drawn, the block is removed
rather than passed on. A reader who was promised a picture and gets a quiet
line has lost something; a reader who gets a wall of JSON has been shown the
working of a machine, which is worse.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from .charts import check_not_degenerate
from .compute import ComputeError, evaluate

logger = logging.getLogger(__name__)

#: A fenced block the apps render as a drawing.
GRAPH_FENCE = re.compile(r'```[ \t]*(graph|plot|chart)[ \t]*\r?\n(.*?)```', re.DOTALL | re.IGNORECASE)

#: How many points to sample a function at. Enough for a smooth curve on a
#: phone, few enough not to bloat the answer.
SAMPLES = 80

#: How far a marked point may sit from the curve it claims to be on, relative
#: to the span of the plot.
POINT_TOLERANCE = 5e-3

#: What is left where a drawing could not be trusted.
REMOVED_NOTE = '_A chart was meant to appear here._'


@dataclass(frozen=True)
class GraphIssue:
    kind: str
    detail: str


def _sample(expr: str, x0: float, x1: float, samples: int = SAMPLES) -> list[tuple[float, float]]:
    """Points on y = f(x), evaluated by code.

    Values the expression cannot produce at a given x - a vertical asymptote,
    a root of a negative number - are skipped rather than faked, so a curve
    with a gap keeps its gap.
    """

    points: list[tuple[float, float]] = []
    step = (x1 - x0) / samples if samples else 0
    for index in range(samples + 1):
        x = x0 + step * index
        try:
            y = evaluate(expr, {'x': x})
        except ComputeError:
            continue
        points.append((x, y))
    return points


def _as_pair(value) -> tuple[float, float] | None:
    if isinstance(value, (list, tuple)) and len(value) == 2:
        try:
            return float(value[0]), float(value[1])
        except (TypeError, ValueError):
            return None
    return None


def _check_plane(spec: dict) -> tuple[dict, list[GraphIssue]]:
    """Sample every function, and drop marked points that are not on one."""

    issues: list[GraphIssue] = []
    x_range = _as_pair(spec.get('x') or spec.get('xRange')) or (-10.0, 10.0)
    if x_range[0] >= x_range[1]:
        return spec, [GraphIssue('bad-range', 'the x range does not increase')]

    functions = spec.get('functions')
    if not isinstance(functions, list) or not functions:
        return spec, issues

    sampled: dict[str, list[tuple[float, float]]] = {}
    for index, function in enumerate(functions):
        if not isinstance(function, dict):
            continue
        expr = function.get('expr') or function.get('fn')
        if not isinstance(expr, str) or not expr.strip():
            continue
        domain = _as_pair(function.get('domain')) or x_range
        points = _sample(expr, max(domain[0], x_range[0]), min(domain[1], x_range[1]))
        if len(points) < 2:
            issues.append(GraphIssue('uncomputable-curve', f'{expr!r} could not be evaluated'))
            continue
        sampled[function.get('label') or expr] = points

    if not sampled:
        return spec, issues

    # The vertical-line failure: a curve that does not extend both ways.
    issues += [GraphIssue(p.kind, p.detail) for p in check_not_degenerate(sampled)]

    # Marked points must lie on one of the curves they are drawn against.
    marked = spec.get('points')
    if isinstance(marked, list) and marked:
        span = max(
            max(abs(p[1]) for points in sampled.values() for p in points) or 1.0,
            abs(x_range[1] - x_range[0]),
        )
        kept = []
        for point in marked:
            if not isinstance(point, dict):
                continue
            try:
                x, y = float(point.get('x')), float(point.get('y'))
            except (TypeError, ValueError):
                continue
            on_a_curve = any(
                any(abs(px - x) <= abs(x_range[1] - x_range[0]) / SAMPLES and abs(py - y) <= POINT_TOLERANCE * span
                    for px, py in points)
                for points in sampled.values()
            )
            if on_a_curve or not sampled:
                kept.append(point)
            else:
                issues.append(
                    GraphIssue('point-off-curve', f'({x:g}, {y:g}) is not on any curve drawn here')
                )
        if len(kept) != len(marked):
            spec = {**spec, 'points': kept}

    return spec, issues


def _check_data_chart(spec: dict) -> list[GraphIssue]:
    """A bar, line, area or pie chart must have something behind every name."""

    issues: list[GraphIssue] = []
    series = spec.get('series')
    if isinstance(series, list) and series:
        for entry in series:
            if not isinstance(entry, dict):
                continue
            values = entry.get('values') or entry.get('data') or entry.get('y')
            name = entry.get('name') or entry.get('label') or 'a series'
            # The discharge-curve failure: named in the legend, no line behind it.
            if not isinstance(values, list) or not any(
                isinstance(v, (int, float)) for v in values
            ):
                issues.append(GraphIssue('empty-series', f'{name!r} is named but has no values'))
        return issues

    rows = spec.get('data') or spec.get('values')
    if not isinstance(rows, list) or not rows:
        issues.append(GraphIssue('empty-chart', 'the chart has no data'))
    return issues


def guard_graphs(text: str) -> tuple[str, list[GraphIssue]]:
    """Check every graph block in an answer, and rewrite the text if needed.

    Returns the answer to show and what was found. A block that cannot be read
    or cannot be drawn is replaced by a short line: the reader loses a picture,
    which is a fair price for never being shown a broken one or a page of JSON.
    """

    if not text or '```' not in text:
        return text, []

    all_issues: list[GraphIssue] = []

    def replace(match: re.Match) -> str:
        language, body = match.group(1), match.group(2)
        try:
            spec = json.loads(body)
        except (ValueError, TypeError):
            all_issues.append(GraphIssue('unreadable', 'the chart description was not valid JSON'))
            return REMOVED_NOTE
        if not isinstance(spec, dict):
            all_issues.append(GraphIssue('unreadable', 'the chart description was not an object'))
            return REMOVED_NOTE

        kind = str(spec.get('type') or spec.get('kind') or '').strip().lower()

        if kind in {'bar', 'column', 'line', 'area', 'pie', 'donut', 'doughnut', 'histogram'}:
            issues = _check_data_chart(spec)
            all_issues.extend(issues)
            if any(i.kind in {'empty-chart'} for i in issues):
                return REMOVED_NOTE
            return match.group(0)

        if kind == 'numberline':
            return match.group(0)

        repaired, issues = _check_plane(spec)
        all_issues.extend(issues)
        if any(i.kind in {'bad-range', 'degenerate-curve'} for i in issues):
            return REMOVED_NOTE
        if repaired is not spec:
            return f'```{language}\n{json.dumps(repaired)}\n```'
        return match.group(0)

    cleaned = GRAPH_FENCE.sub(replace, text)
    if all_issues:
        logger.info(
            'Graph guard found %s issue(s): %s',
            len(all_issues),
            '; '.join(f'{i.kind}' for i in all_issues[:5]),
        )
    return cleaned, all_issues
