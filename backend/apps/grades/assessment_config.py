"""Per-school assessment configuration for the shared grading engine.

Basic Education (nursery/primary) needs a different scale, grade labels and
calendar shape than the Cameroon secondary default. Instead of a second engine,
the one engine reads this configuration through ``get_assessment_config``.

The DEFAULTS reproduce the historical hard-coded behaviour exactly:
marks 0-20, pass mark 10, letters A-F at 16/14/12/10, six sequences over three
terms (``sequences_per_term`` = 2), coefficients on, ranking on.

The configuration lives in ``schools.SchoolSettings.assessment_config`` (JSON).
Only schools with ``education_category == 'basic'`` may move away from the
defaults; everyone else always resolves to the defaults.

This module deliberately has no model imports at import time so ``schools`` can
validate with it without depending on the grades models.
"""
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Tuple

GRADING_NUMERIC = 'numeric'
GRADING_DESCRIPTIVE = 'descriptive'
GRADING_STYLES = (GRADING_NUMERIC, GRADING_DESCRIPTIVE)

ALLOWED_KEYS = (
    'max_score',
    'pass_mark',
    'grade_bands',
    'sequences_per_term',
    'use_coefficients',
    'show_rank',
    'grading_style',
    'descriptive_bands',
    'preset',
    'assessment_mode',
    'evaluations_per_term',
    'show_average',
    'show_coefficients',
    'show_subject_position',
    'show_class_average',
    'show_attendance',
    'show_conduct',
    'show_promotion',
    'nursery_scale',
    'evaluation_labels',
)

# Stored keys are snake_case. The camelCase names of the JuniorIgnite document
# config (desktop/shared/documentConfig.ts) are accepted on input and mapped here.
CAMEL_ALIASES = {
    'maxScore': 'max_score',
    'passMark': 'pass_mark',
    'gradeBands': 'grade_bands',
    'showCoefficients': 'show_coefficients',
    'showSubjectPosition': 'show_subject_position',
    'showClassAverage': 'show_class_average',
    'showRank': 'show_rank',
    'showAttendance': 'show_attendance',
    'showConduct': 'show_conduct',
    'showPromotion': 'show_promotion',
    'nurseryScale': 'nursery_scale',
    'useCoefficients': 'use_coefficients',
    'sequencesPerTerm': 'sequences_per_term',
    'gradingStyle': 'grading_style',
    'descriptiveBands': 'descriptive_bands',
    'assessmentMode': 'assessment_mode',
    'evaluationsPerTerm': 'evaluations_per_term',
    'showAverage': 'show_average',
    'evaluationLabels': 'evaluation_labels',
}
_ITEM_ALIASES = {'label': 'letter', 'min': 'min_score', 'labelFr': 'label_fr', 'minPercent': 'min_percent'}

TOGGLE_KEYS = (
    'show_coefficients', 'show_subject_position', 'show_class_average',
    'show_attendance', 'show_conduct', 'show_promotion',
)

MODE_SEQUENCE = 'sequence'      # secondary default: exactly 6 sequences, term 3 = whole year
MODE_TERM_BASED = 'term_based'  # term average from the term's own evaluations; annual = mean of 3 terms
ASSESSMENT_MODES = (MODE_SEQUENCE, MODE_TERM_BASED)

DEFAULT_MAX_SCORE = 20
DEFAULT_SEQUENCES_PER_TERM = 2
# Percent-of-max cutoffs; at max_score 20 these are exactly 16/14/12/10.
_DEFAULT_LETTER_PERCENTS = (('A', 80), ('B', 70), ('C', 60), ('D', 50), ('F', 0))
# Remark column cutoffs as percent of max (16/14/12/10/8 on the 0-20 scale).
_REMARK_PERCENTS = ((80, 'Excellent'), (70, 'Very Good'), (60, 'Good'), (50, 'Average'), (40, 'Poor'))
# Editable starting labels for descriptive (competency) grading.
DEFAULT_DESCRIPTIVE_BANDS = [
    {'label': 'Not yet', 'min_percent': 0},
    {'label': 'Developing', 'min_percent': 40},
    {'label': 'Achieved', 'min_percent': 60},
    {'label': 'Exceeds', 'min_percent': 85},
]

# --- Presets -------------------------------------------------------------
# Authoritative source: the JuniorIgnite document config (documentConfig.ts):
# marks out of 20, pass mark 10, three terms, two evaluations per term
# (Test/CA then Exam, subject average = (test + exam) / 2, coefficient-weighted
# term average), annual average = mean of the term averages, six grade bands
# (min on /20 -> label/labelFr). Nursery has no marks, averages or ranks: pupils
# are rated per developmental area on a 4-level scale. Every field stays
# overridable by passing it next to ``preset``.
PRESET_PRIMARY_NUMERIC = 'primary_numeric'
PRESET_NURSERY_DESCRIPTIVE = 'nursery_descriptive'

DEFAULT_NURSERY_SCALE = [
    {'label': 'Beginning', 'label_fr': 'D\u00e9butant'},
    {'label': 'Developing', 'label_fr': 'En progr\u00e8s'},
    {'label': 'Secure', 'label_fr': 'Acquis'},
    {'label': 'Excelling', 'label_fr': 'Excellent'},
]
# (label, label_fr, min as percent of max_score); at max 20 these are 18/16/14/12/10/0.
PRIMARY_BAND_PERCENTS = (
    ('Excellent', 'Excellent', 90),
    ('Very Good', 'Tr\u00e8s bien', 80),
    ('Good', 'Bien', 70),
    ('Fairly Good', 'Assez bien', 60),
    ('Pass', 'Passable', 50),
    ('Fail', 'Insuffisant', 0),
)
PRIMARY_EVALUATION_LABELS = [
    {'label': 'Test', 'label_fr': 'Devoir'},
    {'label': 'Exam', 'label_fr': 'Examen'},
]
PRESETS = {
    PRESET_PRIMARY_NUMERIC: {
        'max_score': 20,
        'pass_mark': 10,
        'grading_style': GRADING_NUMERIC,
        'assessment_mode': MODE_TERM_BASED,
        'evaluations_per_term': 2,
        'evaluation_labels': PRIMARY_EVALUATION_LABELS,
        'show_rank': True,
        'use_coefficients': True,
        'show_coefficients': True,
        'show_class_average': True,
        'show_subject_position': False,
        'show_attendance': True,
        'show_conduct': True,
        'show_promotion': True,
    },
    PRESET_NURSERY_DESCRIPTIVE: {
        'max_score': 20,
        'grading_style': GRADING_DESCRIPTIVE,
        'assessment_mode': MODE_TERM_BASED,
        'evaluations_per_term': 1,
        'show_rank': False,
        'show_average': False,
        'use_coefficients': False,
        'show_coefficients': False,
        'show_class_average': False,
        'show_subject_position': False,
        'nursery_scale': DEFAULT_NURSERY_SCALE,
    },
}


class AssessmentConfigError(ValueError):
    """Raised with a ``{key: message}`` dict in ``args[0]``."""

    @property
    def errors(self):
        return self.args[0]


def _num(value):
    """Plain JSON number: int when whole, else float rounded to 2 places."""
    d = value if isinstance(value, Decimal) else Decimal(str(value))
    if d == d.to_integral_value():
        return int(d)
    return float(d.quantize(Decimal('0.01')))


def _to_decimal(value, key):
    if isinstance(value, bool):
        raise AssessmentConfigError({key: 'Must be a number.'})
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise AssessmentConfigError({key: 'Must be a number.'})
    if not d.is_finite():
        raise AssessmentConfigError({key: 'Must be a number.'})
    return d


def default_grade_bands(max_score=DEFAULT_MAX_SCORE):
    max_d = Decimal(str(max_score))
    return [
        {'letter': letter, 'min_score': _num(Decimal(percent) * max_d / Decimal(100))}
        for letter, percent in _DEFAULT_LETTER_PERCENTS
    ]


def default_assessment_config():
    return {
        'max_score': DEFAULT_MAX_SCORE,
        'pass_mark': 10,
        'grade_bands': default_grade_bands(DEFAULT_MAX_SCORE),
        'sequences_per_term': DEFAULT_SEQUENCES_PER_TERM,
        'use_coefficients': True,
        'show_rank': True,
        'grading_style': GRADING_NUMERIC,
        'descriptive_bands': [dict(b) for b in DEFAULT_DESCRIPTIVE_BANDS],
        'preset': '',
        'assessment_mode': MODE_SEQUENCE,
        'evaluations_per_term': DEFAULT_SEQUENCES_PER_TERM,
        'show_average': True,
        'show_coefficients': True,
        'show_subject_position': True,
        'show_class_average': True,
        'show_attendance': True,
        'show_conduct': True,
        'show_promotion': True,
        'nursery_scale': [dict(level) for level in DEFAULT_NURSERY_SCALE],
        'evaluation_labels': [],
    }


def _clean_label_item(item, index, key, max_len):
    if not isinstance(item, dict):
        raise AssessmentConfigError({key: f'Item {index} must be an object.'})
    item = {_ITEM_ALIASES.get(k, k) if k != 'label' else k: v for k, v in item.items()}
    label = str(item.get('label') or '').strip()
    if not label or len(label) > max_len:
        raise AssessmentConfigError({key: f'Item {index} needs a label of 1 to {max_len} characters.'})
    out = {'label': label}
    label_fr = item.get('label_fr')
    if label_fr not in (None, ''):
        if not isinstance(label_fr, str) or not label_fr.strip() or len(label_fr) > max_len:
            raise AssessmentConfigError({key: f'Item {index} label_fr must be 1 to {max_len} characters.'})
        out['label_fr'] = label_fr.strip()
    return out


def validate_assessment_config(raw):
    """Validate ``raw`` and return the full normalised config dict.

    Missing keys take their defaults (``pass_mark`` and ``grade_bands`` scale with
    ``max_score``). Raises ``AssessmentConfigError({key: message})``.
    """
    if raw in (None, ''):
        raw = {}
    if not isinstance(raw, dict):
        raise AssessmentConfigError({'assessment_config': 'Must be an object.'})
    raw = {CAMEL_ALIASES.get(k, k): v for k, v in raw.items()}
    unknown = sorted(set(raw) - set(ALLOWED_KEYS))
    if unknown:
        raise AssessmentConfigError({'assessment_config': f'Unknown keys: {", ".join(map(str, unknown))}.'})

    preset = raw.get('preset') or ''
    if preset:
        if preset not in PRESETS:
            raise AssessmentConfigError({'preset': f'Must be one of: {", ".join(PRESETS)}.'})
        # Preset values are the base; anything the school sets explicitly wins.
        raw = {**PRESETS[preset], **{k: v for k, v in raw.items() if k != 'preset'}}
        if preset == PRESET_PRIMARY_NUMERIC and raw.get('grade_bands') is None:
            # JuniorIgnite bands are defined on /20; scale them if max_score is overridden.
            top = Decimal(str(raw.get('max_score', DEFAULT_MAX_SCORE)))
            raw['grade_bands'] = [
                {'letter': label, 'label_fr': fr, 'min_score': _num(Decimal(pct) * top / Decimal(100))}
                for label, fr, pct in PRIMARY_BAND_PERCENTS
            ]

    # max_score
    max_score = _to_decimal(raw.get('max_score', DEFAULT_MAX_SCORE), 'max_score')
    if max_score < 1 or max_score > 100:
        raise AssessmentConfigError({'max_score': 'Must be between 1 and 100.'})

    # pass_mark (default 10 at 20; otherwise half of max_score)
    if raw.get('pass_mark') is None:
        pass_mark = Decimal(10) * max_score / Decimal(DEFAULT_MAX_SCORE)
    else:
        pass_mark = _to_decimal(raw['pass_mark'], 'pass_mark')
    if pass_mark < 0 or pass_mark > max_score:
        raise AssessmentConfigError({'pass_mark': f'Must be between 0 and {_num(max_score)}.'})

    # grade_bands
    bands_in = raw.get('grade_bands')
    if bands_in is None:
        bands = default_grade_bands(max_score)
    else:
        if not isinstance(bands_in, list) or not bands_in:
            raise AssessmentConfigError({'grade_bands': 'Must be a non-empty list of {letter, min_score}.'})
        bands = []
        previous = None
        for index, item in enumerate(bands_in, start=1):
            if not isinstance(item, dict):
                raise AssessmentConfigError({'grade_bands': f'Band {index} must be an object.'})
            item = {_ITEM_ALIASES.get(k, k): v for k, v in item.items()}
            letter = str(item.get('letter') or '').strip()
            if not letter:
                raise AssessmentConfigError({'grade_bands': f'Band {index} needs a non-empty letter.'})
            if len(letter) > 30:
                raise AssessmentConfigError({'grade_bands': f'Band {index} letter is too long.'})
            if 'min_score' not in item:
                raise AssessmentConfigError({'grade_bands': f'Band {index} needs min_score.'})
            min_score = _to_decimal(item['min_score'], 'grade_bands')
            if min_score < 0 or min_score > max_score:
                raise AssessmentConfigError({'grade_bands': f'Band {index} min_score must be between 0 and {_num(max_score)}.'})
            if previous is not None and min_score >= previous:
                raise AssessmentConfigError({'grade_bands': 'Bands must be sorted from highest to lowest min_score, without duplicates.'})
            previous = min_score
            band = {'letter': letter, 'min_score': _num(min_score)}
            band_fr = item.get('label_fr')
            if band_fr not in (None, ''):
                if not isinstance(band_fr, str) or not band_fr.strip() or len(band_fr) > 30:
                    raise AssessmentConfigError({'grade_bands': f'Band {index} label_fr must be a non-empty text.'})
                band['label_fr'] = band_fr.strip()
            bands.append(band)
        if Decimal(str(bands[-1]['min_score'])) != 0:
            raise AssessmentConfigError({'grade_bands': 'The lowest band must start at 0 so every mark has a grade.'})

    # sequences_per_term
    spt = raw.get('sequences_per_term', DEFAULT_SEQUENCES_PER_TERM)
    if isinstance(spt, bool) or not isinstance(spt, int) or spt < 1 or spt > 4:
        raise AssessmentConfigError({'sequences_per_term': 'Must be a whole number between 1 and 4.'})

    mode = raw.get('assessment_mode', MODE_SEQUENCE)
    if mode not in ASSESSMENT_MODES:
        raise AssessmentConfigError({'assessment_mode': f'Must be one of: {", ".join(ASSESSMENT_MODES)}.'})
    ept = raw.get('evaluations_per_term', DEFAULT_SEQUENCES_PER_TERM)
    if isinstance(ept, bool) or not isinstance(ept, int) or ept < 1 or ept > 3:
        raise AssessmentConfigError({'evaluations_per_term': 'Must be a whole number between 1 and 3.'})

    for key in ('use_coefficients', 'show_rank', 'show_average') + TOGGLE_KEYS:
        value = raw.get(key, True)
        if not isinstance(value, bool):
            raise AssessmentConfigError({key: 'Must be true or false.'})

    style = raw.get('grading_style', GRADING_NUMERIC)
    if style not in GRADING_STYLES:
        raise AssessmentConfigError({'grading_style': f'Must be one of: {", ".join(GRADING_STYLES)}.'})

    # descriptive_bands
    desc_in = raw.get('descriptive_bands')
    if desc_in is None:
        desc = [dict(b) for b in DEFAULT_DESCRIPTIVE_BANDS]
    else:
        if not isinstance(desc_in, list) or not desc_in:
            raise AssessmentConfigError({'descriptive_bands': 'Must be a non-empty list of {label, min_percent}.'})
        desc = []
        previous = None
        for index, item in enumerate(desc_in, start=1):
            if not isinstance(item, dict):
                raise AssessmentConfigError({'descriptive_bands': f'Label {index} must be an object.'})
            item = {_ITEM_ALIASES.get(k, k) if k != 'label' else k: v for k, v in item.items()}
            label = str(item.get('label') or '').strip()
            if not label:
                raise AssessmentConfigError({'descriptive_bands': f'Label {index} needs a non-empty label.'})
            if len(label) > 60:
                raise AssessmentConfigError({'descriptive_bands': f'Label {index} is too long.'})
            if 'min_percent' not in item:
                raise AssessmentConfigError({'descriptive_bands': f'Label {index} needs min_percent.'})
            percent = _to_decimal(item['min_percent'], 'descriptive_bands')
            if percent < 0 or percent > 100:
                raise AssessmentConfigError({'descriptive_bands': f'Label {index} min_percent must be between 0 and 100.'})
            if previous is not None and percent <= previous:
                raise AssessmentConfigError({'descriptive_bands': 'Labels must be sorted from lowest to highest min_percent, without duplicates.'})
            previous = percent
            entry = {'label': label, 'min_percent': _num(percent)}
            label_fr = item.get('label_fr')
            if label_fr not in (None, ''):
                if not isinstance(label_fr, str) or not label_fr.strip() or len(label_fr) > 60:
                    raise AssessmentConfigError({'descriptive_bands': f'Label {index} label_fr must be a non-empty text.'})
                entry['label_fr'] = label_fr.strip()
            desc.append(entry)
        if Decimal(str(desc[0]['min_percent'])) != 0:
            raise AssessmentConfigError({'descriptive_bands': 'The first label must start at 0 percent.'})

    scale_in = raw.get('nursery_scale')
    if scale_in is None:
        scale = [dict(level) for level in DEFAULT_NURSERY_SCALE]
    else:
        if not isinstance(scale_in, list) or not 2 <= len(scale_in) <= 6:
            raise AssessmentConfigError({'nursery_scale': 'Must be a list of 2 to 6 levels, lowest first.'})
        scale = []
        for index, item in enumerate(scale_in, start=1):
            scale.append(_clean_label_item(item, index, 'nursery_scale', 24))

    eval_in = raw.get('evaluation_labels')
    if eval_in is None:
        eval_labels = []
    else:
        if not isinstance(eval_in, list) or len(eval_in) > ept:
            raise AssessmentConfigError({'evaluation_labels': f'Must be a list of at most {ept} labels (one per evaluation).'})
        eval_labels = [_clean_label_item(item, i, 'evaluation_labels', 24) for i, item in enumerate(eval_in, start=1)]

    return {
        'max_score': _num(max_score),
        'pass_mark': _num(pass_mark),
        'grade_bands': bands,
        'sequences_per_term': spt,
        'use_coefficients': raw.get('use_coefficients', True),
        'show_rank': raw.get('show_rank', True),
        'grading_style': style,
        'descriptive_bands': desc,
        'preset': preset,
        'assessment_mode': mode,
        'evaluations_per_term': ept,
        'show_average': raw.get('show_average', True),
        **{key: raw.get(key, True) for key in TOGGLE_KEYS},
        'nursery_scale': scale,
        'evaluation_labels': eval_labels,
    }


def is_default_assessment_config(raw):
    """True when ``raw`` (after normalisation) equals the built-in defaults."""
    return validate_assessment_config(raw) == default_assessment_config()


@dataclass(frozen=True)
class AssessmentConfig:
    max_score: Decimal = Decimal(DEFAULT_MAX_SCORE)
    pass_mark: Decimal = Decimal(10)
    grade_bands: Tuple[Tuple[str, Decimal], ...] = tuple(
        (b['letter'], Decimal(str(b['min_score']))) for b in default_grade_bands()
    )
    sequences_per_term: int = DEFAULT_SEQUENCES_PER_TERM
    use_coefficients: bool = True
    show_rank: bool = True
    grading_style: str = GRADING_NUMERIC
    descriptive_bands: Tuple[Tuple[str, Decimal], ...] = tuple(
        (b['label'], Decimal(str(b['min_percent']))) for b in DEFAULT_DESCRIPTIVE_BANDS
    )
    descriptive_labels_fr: Tuple[str, ...] = ('', '', '', '')
    preset: str = ''
    assessment_mode: str = MODE_SEQUENCE
    evaluations_per_term: int = DEFAULT_SEQUENCES_PER_TERM
    show_average: bool = True
    grade_bands_fr: Tuple[str, ...] = ('', '', '', '', '')
    show_coefficients: bool = True
    show_subject_position: bool = True
    show_class_average: bool = True
    show_attendance: bool = True
    show_conduct: bool = True
    show_promotion: bool = True
    nursery_scale: Tuple[Tuple[str, str], ...] = tuple(
        (level['label'], level.get('label_fr', '')) for level in DEFAULT_NURSERY_SCALE
    )
    evaluation_labels: Tuple[Tuple[str, str], ...] = ()

    @classmethod
    def from_dict(cls, data):
        data = validate_assessment_config(data)
        return cls(
            max_score=Decimal(str(data['max_score'])),
            pass_mark=Decimal(str(data['pass_mark'])),
            grade_bands=tuple((b['letter'], Decimal(str(b['min_score']))) for b in data['grade_bands']),
            sequences_per_term=data['sequences_per_term'],
            use_coefficients=data['use_coefficients'],
            show_rank=data['show_rank'],
            grading_style=data['grading_style'],
            descriptive_bands=tuple((b['label'], Decimal(str(b['min_percent']))) for b in data['descriptive_bands']),
            descriptive_labels_fr=tuple(b.get('label_fr', '') for b in data['descriptive_bands']),
            preset=data['preset'],
            assessment_mode=data['assessment_mode'],
            evaluations_per_term=data['evaluations_per_term'],
            show_average=data['show_average'],
            grade_bands_fr=tuple(b.get('label_fr', '') for b in data['grade_bands']),
            show_coefficients=data['show_coefficients'],
            show_subject_position=data['show_subject_position'],
            show_class_average=data['show_class_average'],
            show_attendance=data['show_attendance'],
            show_conduct=data['show_conduct'],
            show_promotion=data['show_promotion'],
            nursery_scale=tuple((l['label'], l.get('label_fr', '')) for l in data['nursery_scale']),
            evaluation_labels=tuple((l['label'], l.get('label_fr', '')) for l in data['evaluation_labels']),
        )

    # ---- derived helpers -------------------------------------------------
    @property
    def is_term_based(self):
        return self.assessment_mode == MODE_TERM_BASED

    @property
    def effective_per_term(self):
        """Evaluations/sequences per term the calendar must contain."""
        return self.evaluations_per_term if self.is_term_based else self.sequences_per_term

    @property
    def total_sequences(self):
        return 3 * self.effective_per_term

    @property
    def is_descriptive(self):
        return self.grading_style == GRADING_DESCRIPTIVE

    @property
    def is_default(self):
        return self.to_dict() == default_assessment_config()

    def to_dict(self):
        return {
            'max_score': _num(self.max_score),
            'pass_mark': _num(self.pass_mark),
            'grade_bands': [
                {'letter': l, 'min_score': _num(m), **({'label_fr': fr} if fr else {})}
                for (l, m), fr in zip(self.grade_bands, self.grade_bands_fr)
            ],
            'sequences_per_term': self.sequences_per_term,
            'use_coefficients': self.use_coefficients,
            'show_rank': self.show_rank,
            'grading_style': self.grading_style,
            'descriptive_bands': [
                {'label': l, 'min_percent': _num(p), **({'label_fr': fr} if fr else {})}
                for (l, p), fr in zip(self.descriptive_bands, self.descriptive_labels_fr)
            ],
            'preset': self.preset,
            'assessment_mode': self.assessment_mode,
            'evaluations_per_term': self.evaluations_per_term,
            'show_average': self.show_average,
            **{key: getattr(self, key) for key in TOGGLE_KEYS},
            'nursery_scale': [{'label': l, **({'label_fr': fr} if fr else {})} for l, fr in self.nursery_scale],
            'evaluation_labels': [{'label': l, **({'label_fr': fr} if fr else {})} for l, fr in self.evaluation_labels],
        }

    @staticmethod
    def _dec(score):
        return score if isinstance(score, Decimal) else Decimal(str(score))

    def percent(self, score):
        return self._dec(score) * Decimal(100) / self.max_score

    def scale_from_20(self, value):
        """Convert a value kept on the legacy 0-20 scale (honour roll...) to this scale."""
        value = self._dec(value)
        if self.max_score == Decimal(DEFAULT_MAX_SCORE):
            return value
        return value * self.max_score / Decimal(DEFAULT_MAX_SCORE)

    def letter(self, score):
        value = self._dec(score)
        for letter, minimum in self.grade_bands:
            if value >= minimum:
                return letter
        return self.grade_bands[-1][0]

    def descriptive_label(self, score):
        percent = self.percent(score)
        chosen = self.descriptive_bands[0][0]
        for label, minimum in self.descriptive_bands:
            if percent >= minimum:
                chosen = label
        return chosen

    def descriptive_label_fr(self, score):
        percent = self.percent(score)
        chosen = ''
        for (_label, minimum), fr in zip(self.descriptive_bands, self.descriptive_labels_fr):
            if percent >= minimum or not chosen:
                chosen = fr
        return chosen

    def label(self, score):
        """Letter for numeric grading, competency label for descriptive grading."""
        return self.descriptive_label(score) if self.is_descriptive else self.letter(score)

    def letter_fr(self, score):
        value = self._dec(score)
        for (letter, minimum), fr in zip(self.grade_bands, self.grade_bands_fr):
            if value >= minimum:
                return fr
        return self.grade_bands_fr[-1] if self.grade_bands_fr else ''

    def label_fr(self, score):
        return self.descriptive_label_fr(score) if self.is_descriptive else self.letter_fr(score)

    @property
    def has_custom_bands(self):
        return [b['letter'] for b in default_grade_bands(self.max_score)] != [l for l, _ in self.grade_bands] or \
            [Decimal(str(b['min_score'])) for b in default_grade_bands(self.max_score)] != [m for _, m in self.grade_bands]

    def evaluation_label(self, index, french=False):
        """Label for the ``index``-th (0-based) evaluation of a term, '' when none is set."""
        if 0 <= index < len(self.evaluation_labels):
            label, label_fr = self.evaluation_labels[index]
            return (label_fr or label) if french else label
        return ''

    def remark(self, score):
        if self.is_descriptive:
            return self.descriptive_label(score)
        if self.has_custom_bands:
            return self.letter(score)
        percent = self.percent(score)
        for minimum, text in _REMARK_PERCENTS:
            if percent >= minimum:
                return text
        return 'Very Poor'

    def is_pass(self, average):
        return self._dec(average) >= self.pass_mark

    def coefficient(self, subject):
        if not self.use_coefficients:
            return Decimal('1.00')
        return Decimal(str(subject.coefficient))


DEFAULT_CONFIG = AssessmentConfig()


def get_assessment_config(school, cache=None):
    """THE single entry point: resolve the assessment config for ``school``.

    ``school`` may be a School instance, a school id, or None. Non-basic schools
    (and anything unreadable) resolve to the defaults. ``cache`` is an optional
    dict (e.g. serializer context) to avoid repeated lookups in list responses.
    """
    if school is None:
        return DEFAULT_CONFIG
    school_id = getattr(school, 'pk', school)
    if cache is not None and school_id in cache:
        return cache[school_id]

    config = DEFAULT_CONFIG
    try:
        from apps.schools.models import School, SchoolSettings

        category = getattr(school, 'education_category', None) if hasattr(school, 'pk') else None
        if hasattr(school, 'pk'):
            try:
                raw = school.settings.assessment_config
            except Exception:  # noqa: BLE001 - no settings row yet
                raw = None
        else:
            row = SchoolSettings.objects.filter(school_id=school_id).values_list(
                'assessment_config', 'school__education_category'
            ).first()
            raw, category = (row if row else (None, None))
        if category == School.EDUCATION_CATEGORY_BASIC and raw:
            config = AssessmentConfig.from_dict(raw)
    except Exception:  # noqa: BLE001 - never break grading on a bad config
        config = DEFAULT_CONFIG
    if cache is not None:
        cache[school_id] = config
    return config
