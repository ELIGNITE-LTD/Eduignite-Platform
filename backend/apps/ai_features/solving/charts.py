"""Charts checked against the solution before anyone sees them.

Three things went wrong on screen, and all three are checkable without a human
looking: a trajectory that came out as a near-vertical line instead of a
parabola, a discharge curve that appeared in the legend with no line behind
it, and a label clipped at the edge of the plot.

They were possible because the model wrote the chart's numbers itself,
separately from the numbers it had just worked out. Here the curves come from
the solution, and these functions refuse the chart if they disagree.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .compute import Computed

#: How far a plotted key point may sit from the computed one, relative to the
#: span of the axis.
POINT_TOLERANCE = 2e-3
#: A curve flatter or steeper than this is not a curve anyone asked for. A
#: parabola drawn as a vertical line has an aspect far outside it.
MIN_SPAN_RATIO = 1e-3


@dataclass(frozen=True)
class ChartProblem:
    kind: str
    detail: str


def _spans(points: list[tuple[float, float]]) -> tuple[float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return max(xs) - min(xs), max(ys) - min(ys)


def check_curve_present(curves: dict[str, list], required: list[str]) -> list[ChartProblem]:
    """Every curve the question asked for must have points behind it.

    This is the Q3 failure: 'discharging' was named in the legend and had no
    line, because nothing ever checked that the name had data.
    """

    problems = []
    for name in required:
        points = curves.get(name)
        if not points:
            problems.append(ChartProblem('missing-curve', f'{name!r} was requested but has no data'))
        elif len(points) < 3:
            problems.append(ChartProblem('missing-curve', f'{name!r} has only {len(points)} point(s)'))
    return problems


def check_not_degenerate(curves: dict[str, list]) -> list[ChartProblem]:
    """A curve must actually extend in both directions.

    This is the Q1 failure: the trajectory was plotted as a near-vertical
    line. Its horizontal span was almost nothing next to its vertical span,
    which is exactly what this measures.
    """

    problems = []
    for name, points in curves.items():
        if not points or len(points) < 3:
            continue
        dx, dy = _spans(points)
        if dx <= 0 and dy <= 0:
            problems.append(ChartProblem('degenerate-curve', f'{name!r} is a single point'))
            continue
        scale = max(dx, dy)
        if dx / scale < MIN_SPAN_RATIO:
            problems.append(
                ChartProblem('degenerate-curve', f'{name!r} is effectively a vertical line (x span {dx:.3g})')
            )
        elif dy / scale < MIN_SPAN_RATIO:
            problems.append(
                ChartProblem('degenerate-curve', f'{name!r} is effectively a horizontal line (y span {dy:.3g})')
            )
    return problems


def check_key_points(
    curve: list[tuple[float, float]],
    expected: dict[str, tuple[float, float]],
    *,
    tolerance: float = POINT_TOLERANCE,
) -> list[ChartProblem]:
    """Named points must lie on the drawn curve, not near it by luck."""

    problems = []
    if not curve:
        return [ChartProblem('key-point', 'the curve has no points to check')]
    dx, dy = _spans(curve)
    scale = max(dx, dy, 1e-12)

    for name, (x, y) in expected.items():
        nearest = min(curve, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)
        distance = math.hypot(nearest[0] - x, nearest[1] - y)
        if distance / scale > tolerance:
            problems.append(
                ChartProblem(
                    'key-point',
                    f'{name} should be at ({x:.4g}, {y:.4g}) but the curve passes '
                    f'({nearest[0]:.4g}, {nearest[1]:.4g})',
                )
            )
    return problems


def check_labels_fit(
    labels: list[dict],
    x_range: tuple[float, float],
    y_range: tuple[float, float],
    *,
    margin: float = 0.02,
) -> list[ChartProblem]:
    """A label sitting on the edge of the plot gets cut off when it is drawn.

    The axes must contain every label with a little room, which is the
    clipping failure from Q1.
    """

    problems = []
    x_span = x_range[1] - x_range[0]
    y_span = y_range[1] - y_range[0]
    for label in labels:
        x, y = float(label.get('x', 0)), float(label.get('y', 0))
        text = str(label.get('text', ''))
        if not (x_range[0] + margin * x_span <= x <= x_range[1] - margin * x_span):
            problems.append(ChartProblem('clipped-label', f'{text!r} sits at the horizontal edge'))
        elif not (y_range[0] + margin * y_span <= y <= y_range[1] - margin * y_span):
            problems.append(ChartProblem('clipped-label', f'{text!r} sits at the vertical edge'))
    return problems


def axes_with_margin(
    curves: dict[str, list[tuple[float, float]]],
    *,
    margin: float = 0.08,
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Axis ranges that contain every point with room to spare.

    Computed rather than chosen by the model, so a chart cannot crop its own
    data.
    """

    points = [p for pts in curves.values() for p in pts]
    if not points:
        return (0.0, 1.0), (0.0, 1.0)
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x_pad = max((max(xs) - min(xs)) * margin, 1e-9)
    y_pad = max((max(ys) - min(ys)) * margin, 1e-9)
    return (min(xs) - x_pad, max(xs) + x_pad), (min(ys) - y_pad, max(ys) + y_pad)


def validate_chart(
    curves: dict[str, list[tuple[float, float]]],
    *,
    required: list[str] | None = None,
    key_points: dict[str, dict[str, tuple[float, float]]] | None = None,
    labels: list[dict] | None = None,
) -> list[ChartProblem]:
    """Every chart check in one call. Empty means the chart may be drawn."""

    problems = check_curve_present(curves, required or list(curves))
    problems += check_not_degenerate(curves)

    for curve_name, expected in (key_points or {}).items():
        problems += check_key_points(curves.get(curve_name, []), expected)

    if labels:
        x_range, y_range = axes_with_margin(curves)
        problems += check_labels_fit(labels, x_range, y_range)

    return problems


def key_points_from(computed: Computed, mapping: dict[str, tuple[str, str]]) -> dict[str, tuple[float, float]]:
    """Build the expected points from computed values, never from typed numbers."""

    return {
        label: (computed.value(x_name), computed.value(y_name))
        for label, (x_name, y_name) in mapping.items()
    }
