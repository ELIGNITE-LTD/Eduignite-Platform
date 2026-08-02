import re
import unicodedata

from django.apps import apps
from django.contrib.auth import get_user_model
from django.utils import timezone


SCHOOL_SHORT_NAME_SKIP_WORDS = {
    'a',
    'an',
    'and',
    'at',
    'by',
    'de',
    'des',
    'du',
    'et',
    'for',
    'in',
    'la',
    'le',
    'les',
    'of',
    'or',
    'ou',
    'the',
    'to',
}

FOUNDER_ROLE_CODES = {
    'SUPER_ADMIN': 'SUP',
    'CEO': 'CEO',
    'CTO': 'CTO',
    'COO': 'COO',
    'CFO': 'CFO',
    'CMO': 'CMO',
    'INV': 'INV',
    'DESIGNER': 'DES',
}

SCHOOL_USER_ROLE_CODES = {
    'SUB_ADMIN': 'SA',
    'BURSAR': 'BU',
    'LIBRARIAN': 'LB',
    'TEACHER': 'TE',
    'STUDENT': 'ST',
    'PARENT': 'PA',
}

HIGH_VOLUME_SCHOOL_ROLES = {'STUDENT', 'PARENT'}


def normalize_code_text(value: str) -> str:
    """Return uppercase ASCII alphanumerics from a free-text label."""
    normalized = unicodedata.normalize('NFKD', value or '')
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^A-Za-z0-9]+', '', ascii_text).upper()


def _normalized_words(value: str) -> list[str]:
    normalized = unicodedata.normalize('NFKD', value or '')
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    return re.findall(r'[A-Za-z0-9]+', ascii_text)


def generate_school_short_name(name: str, short_name: str = '') -> str:
    """
    Generate a 2-4 character school abbreviation.

    Examples:
    - "Government Bilingual High School" -> "GBHS"
    - "G.B.H.S." -> "GBHS"
    - "Lycee de Bafoussam" -> "LB"
    """
    preferred = short_name or ''
    preferred_code = normalize_code_text(preferred)
    if 2 <= len(preferred_code) <= 4:
        return preferred_code
    if len(preferred_code) > 4:
        return preferred_code[:4]

    words = [
        word
        for word in _normalized_words(name)
        if word.lower() not in SCHOOL_SHORT_NAME_SKIP_WORDS
    ]
    initials = ''.join(word[0].upper() for word in words if word)
    if len(initials) >= 2:
        return initials[:4]

    fallback = normalize_code_text(name)[:4] or 'SCH'
    if len(fallback) == 1:
        fallback = f'{fallback}S'
    return fallback[:4]


def _current_two_digit_year(value=None) -> str:
    source = value or timezone.now()
    year = source.year if hasattr(source, 'year') else int(source)
    return f'{year % 100:02d}'


def _max_numeric_suffix(values, prefix: str) -> int:
    suffix_pattern = re.compile(rf'^{re.escape(prefix)}(\d+)$')
    counters = []
    for value in values:
        match = suffix_pattern.fullmatch(str(value or ''))
        if match:
            counters.append(int(match.group(1)))
    return max(counters, default=0)


def _school_sequence_floor() -> int:
    School = apps.get_model('schools', 'School')
    pattern = re.compile(r'^[A-Z0-9]{2,4}(\d{2,})\d{2}$')
    parsed_sequences = []
    for matricule in School.objects.exclude(matricule__isnull=True).values_list('matricule', flat=True):
        match = pattern.fullmatch(str(matricule or ''))
        if match:
            parsed_sequences.append(int(match.group(1)))
    # Existing legacy schools still count as registered institutions, so the
    # next sequence remains platform-wide even before all legacy records migrate.
    return max(parsed_sequences + [School.objects.count()], default=0)


def generate_school_matricule(school_name: str, *, short_name: str = '', registered_at=None) -> str:
    """Generate {SHORT_NAME}{SCHOOL_ID}{YY}, with a platform-wide school ID."""
    School = apps.get_model('schools', 'School')
    code = generate_school_short_name(school_name, short_name)
    yy = _current_two_digit_year(registered_at)
    counter = _school_sequence_floor() + 1

    while True:
        matricule = f'{code}{counter:02d}{yy}'
        if not School.objects.filter(matricule=matricule).exists():
            return matricule
        counter += 1


def founder_role_code(role: str) -> str:
    normalized = normalize_code_text(role)
    return FOUNDER_ROLE_CODES.get(role or '', normalized[:3] or 'FND')


def generate_founder_matricule(role: str, *, appointed_at=None) -> str:
    """Generate EDU{ROLE}{YY}{ID}, for founders and executives."""
    User = get_user_model()
    role_code = founder_role_code(role)
    yy = _current_two_digit_year(appointed_at)
    prefix = f'EDU{role_code}{yy}'
    existing = User.objects.filter(matricule__startswith=prefix).values_list('matricule', flat=True)
    counter = _max_numeric_suffix(existing, prefix) + 1

    while True:
        matricule = f'{prefix}{counter:02d}'
        if not User.objects.filter(matricule=matricule).exists():
            return matricule
        counter += 1


def school_user_role_code(role: str) -> str:
    return SCHOOL_USER_ROLE_CODES.get(role or '', normalize_code_text(role)[:2] or 'US')


def school_user_id_width(role: str) -> int:
    return 4 if role in HIGH_VOLUME_SCHOOL_ROLES else 3


def generate_school_user_matricule(school, role: str) -> str:
    """Generate {SCHOOL_MATRICLE}{ROLE_CODE}{USER_ID} for school-scoped users."""
    if not school:
        raise ValueError('School is required to generate a school user matricule.')

    if not getattr(school, 'matricule', None):
        school.matricule = generate_school_matricule(
            school.name,
            short_name=getattr(school, 'short_name', ''),
        )
        school.save(update_fields=['matricule'])

    if role == 'SCHOOL_ADMIN':
        return school.matricule

    User = get_user_model()
    prefix = f'{school.matricule}{school_user_role_code(role)}'
    user_codes = list(User.objects.filter(matricule__startswith=prefix).values_list('matricule', flat=True))

    token_codes = []
    if role == 'STUDENT':
        from apps.students import api as students_api

        token_codes = students_api.list_activation_matricules(prefix)

    counter = _max_numeric_suffix([*user_codes, *token_codes], prefix) + 1
    width = school_user_id_width(role)

    while True:
        matricule = f'{prefix}{counter:0{width}d}'
        user_exists = User.objects.filter(matricule=matricule).exists()
        token_exists = False
        if role == 'STUDENT':
            from apps.students import api as students_api

            token_exists = students_api.activation_matricule_exists(matricule)
        if not user_exists and not token_exists:
            return matricule
        counter += 1
