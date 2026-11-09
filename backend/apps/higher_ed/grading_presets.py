"""Grading presets shipped with Higher Education, plus the pure functions that read them.

Two presets exist and an institution picks one (thresholds stay editable):

* ``gpa_4``    letter grades on a 4.0 scale with degree classes (Anglophone style).
* ``scale_20`` marks out of 20, pass mark 10, mentions and resit capping
               (Francophone style).

Presets are plain JSON so they can be stored on ``GradingPolicy.thresholds``
and edited per institution. Nothing here touches the database.
"""

from __future__ import annotations

import copy
from decimal import Decimal

GPA_4 = 'gpa_4'
SCALE_20 = 'scale_20'

PRESETS = {
    GPA_4: {
        'key': GPA_4,
        'name': 'GPA (4.0 scale, letter grades)',
        'kind': 'gpa',
        'max_score': 100,
        'pass_mark': 50,
        'max_points': 4.0,
        # Highest first. `min` is the lowest score (out of max_score) that earns the grade.
        'grades': [
            {'letter': 'A', 'min': 80, 'points': 4.0},
            {'letter': 'B+', 'min': 75, 'points': 3.5},
            {'letter': 'B', 'min': 70, 'points': 3.0},
            {'letter': 'C+', 'min': 65, 'points': 2.5},
            {'letter': 'C', 'min': 60, 'points': 2.0},
            {'letter': 'D+', 'min': 55, 'points': 1.5},
            {'letter': 'D', 'min': 50, 'points': 1.0},
            {'letter': 'F', 'min': 0, 'points': 0.0},
        ],
        # Degree classes by cumulative GPA, highest first.
        'classes': [
            {'label': 'First Class', 'min': 3.5},
            {'label': 'Second Class Upper', 'min': 3.0},
            {'label': 'Second Class Lower', 'min': 2.5},
            {'label': 'Third Class', 'min': 2.0},
            {'label': 'Pass', 'min': 1.0},
        ],
        'resit': {'allowed': True, 'max_attempts': 1, 'cap_score': 50},
    },
    SCALE_20: {
        'key': SCALE_20,
        'name': 'Marks out of 20 (mentions)',
        'kind': 'scale',
        'max_score': 20,
        'pass_mark': 10,
        # Highest first, `min` is out of 20.
        'mentions': [
            {'label': 'Excellent', 'min': 18},
            {'label': 'Très Bien', 'min': 16},
            {'label': 'Bien', 'min': 14},
            {'label': 'Assez Bien', 'min': 12},
            {'label': 'Passable', 'min': 10},
            {'label': 'Ajourné', 'min': 0},
        ],
        'resit': {'allowed': True, 'max_attempts': 1, 'cap_score': 10},
    },
}


def preset_keys() -> list:
    return list(PRESETS)


def get_preset(key: str) -> dict:
    """A fresh deep copy of a preset, safe to store and edit."""
    if key not in PRESETS:
        raise KeyError(key)
    return copy.deepcopy(PRESETS[key])


def _num(value, label):
    try:
        return Decimal(str(value))
    except Exception:
        raise ValueError(f'{label} must be a number.')


def validate_thresholds(key: str, thresholds) -> list:
    """Return a list of problems (empty when the thresholds are usable)."""
    problems = []
    if key not in PRESETS:
        return [f'Unknown grading preset "{key}".']
    if not isinstance(thresholds, dict):
        return ['Thresholds must be an object.']
    try:
        max_score = _num(thresholds.get('max_score'), 'max_score')
        pass_mark = _num(thresholds.get('pass_mark'), 'pass_mark')
    except ValueError as exc:
        return [str(exc)]
    if max_score <= 0:
        problems.append('max_score must be positive.')
    if not 0 <= pass_mark <= max_score:
        problems.append('pass_mark must be between 0 and max_score.')
    rows_key, label_key = ('grades', 'letter') if key == GPA_4 else ('mentions', 'label')
    rows = thresholds.get(rows_key)
    if not isinstance(rows, list) or not rows:
        problems.append(f'{rows_key} must be a non-empty list.')
        return problems
    last = None
    for row in rows:
        if not isinstance(row, dict) or not row.get(label_key) or 'min' not in row:
            problems.append(f'Every entry of {rows_key} needs a {label_key} and a min.')
            return problems
        try:
            minimum = _num(row['min'], 'min')
            if key == GPA_4:
                _num(row.get('points'), 'points')
        except ValueError as exc:
            problems.append(str(exc))
            return problems
        if last is not None and minimum >= last:
            problems.append(f'{rows_key} must be ordered from highest to lowest min.')
            break
        last = minimum
    if last is not None and last != 0:
        problems.append(f'The lowest entry of {rows_key} must start at 0 so every score has a result.')
    if key == GPA_4 and not isinstance(thresholds.get('classes'), list):
        problems.append('classes must be a list.')
    return problems


def grade_for_score(key: str, thresholds: dict, score) -> dict:
    """Grade for a score out of ``thresholds['max_score']``.

    gpa_4    -> {'letter', 'points', 'passed'}
    scale_20 -> {'mention', 'passed'}
    """
    score = _num(score, 'score')
    max_score = _num(thresholds['max_score'], 'max_score')
    if score < 0 or score > max_score:
        raise ValueError('score is outside the grading scale.')
    passed = score >= _num(thresholds['pass_mark'], 'pass_mark')
    if key == GPA_4:
        for row in thresholds['grades']:
            if score >= _num(row['min'], 'min'):
                return {'letter': row['letter'], 'points': float(row['points']), 'passed': passed}
    else:
        for row in thresholds['mentions']:
            if score >= _num(row['min'], 'min'):
                return {'mention': row['label'], 'passed': passed}
    raise ValueError('No grade matches this score.')


def degree_class(thresholds: dict, cgpa):
    """Degree class label for a cumulative GPA (gpa_4); None when below the lowest class."""
    value = _num(cgpa, 'cgpa')
    for row in thresholds.get('classes', []):
        if value >= _num(row['min'], 'min'):
            return row['label']
    return None


def resit_score(thresholds: dict, score):
    """Score recorded for a resit: capped at the policy cap."""
    score = _num(score, 'score')
    cap = (thresholds.get('resit') or {}).get('cap_score')
    if cap is None:
        return score
    return min(score, _num(cap, 'cap_score'))
