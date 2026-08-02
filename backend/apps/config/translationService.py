import hashlib
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request

from django.core.cache import cache

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {'en', 'fr'}
MAX_TRANSLATION_LENGTH = 5000
TRANSLATION_CACHE_TIMEOUT = 60 * 60 * 24 * 30
FALLBACK_TRANSLATION_CACHE_TIMEOUT = 60 * 10
DEFAULT_REQUEST_TIMEOUT_SECONDS = 8
MAX_TRANSLATION_ATTEMPTS = 3
DEFAULT_LIBRETRANSLATE_URL = 'http://127.0.0.1:5000'

SYSTEM_TERMS_EN_FR = {
    'Dashboard': 'Tableau de bord',
    'Login': 'Connexion',
    'Logout': 'Déconnexion',
    'Account': 'Compte',
    'Settings': 'Paramètres',
    'Invoice': 'Facture',
    'Payment': 'Paiement',
    'User': 'Utilisateur',
    'Admin': 'Administrateur',
}
SYSTEM_TERMS_FR_EN = {value: key for key, value in SYSTEM_TERMS_EN_FR.items()}

SYSTEM_TERMS_EN_FR.update({
    'Academic Calendar': 'Calendrier scolaire',
    'Academic Rewards': 'Récompenses académiques',
    'Academic Year': 'Année scolaire',
    'Add Staff': 'Ajouter un membre du personnel',
    'Add Student': 'Ajouter un élève',
    'Assignment': 'Devoir',
    'Assignments': 'Devoirs',
    'Attendance': 'Présence',
    'Average': 'Moyenne',
    'Balance': 'Solde',
    'Bursar': 'Économe',
    'Calendar': 'Calendrier',
    'Cameroon Scale': 'Barème camerounais',
    'Class Master': 'Professeur principal',
    'Class': 'Classe',
    'Classes': 'Classes',
    'Community': 'Communauté',
    'Download': 'Télécharger',
    'Enter Marks': 'Saisir les notes',
    'Exam': 'Examen',
    'Exams': 'Examens',
    'Fees': 'Frais',
    'First Term': 'Premier trimestre',
    'Guardian': 'Tuteur',
    'Guardians': 'Tuteurs',
    'Honour Roll': 'Tableau d\'honneur',
    'Library': 'Bibliothèque',
    'Logout': 'Déconnexion',
    'Marks': 'Notes',
    'Parent': 'Parent',
    'Parents': 'Parents',
    'Payment Status': 'Statut de paiement',
    'Published': 'Publié',
    'Report Card': 'Bulletin de notes',
    'Report Cards': 'Bulletins de notes',
    'Rewards': 'Récompenses',
    'Schedule': 'Emploi du temps',
    'School Admin': 'Administrateur scolaire',
    'Second Term': 'Deuxième trimestre',
    'Sequence': 'Séquence',
    'Sequences': 'Séquences',
    'Settings': 'Paramètres',
    'Staff': 'Personnel',
    'Student': 'Élève',
    'Students': 'Élèves',
    'Sub-school': 'Sous-école',
    'Subject': 'Matière',
    'Subjects': 'Matières',
    'Teacher': 'Enseignant',
    'Teachers': 'Enseignants',
    'Term': 'Trimestre',
    'Third Term': 'Troisième trimestre',
    'Timetable': 'Emploi du temps',
    'Transcript': 'Relevé de notes',
    'Unpublished': 'Non publié',
})
SYSTEM_TERMS_FR_EN = {value: key for key, value in SYSTEM_TERMS_EN_FR.items()}


class TranslationError(Exception):
    status_code = 500
    public_message = 'Translation could not be completed.'

    def __init__(self, public_message=None, *, status_code=None):
        if public_message:
            self.public_message = public_message
        if status_code:
            self.status_code = status_code
        super().__init__(self.public_message)


class TranslationValidationError(TranslationError):
    status_code = 400


class TranslationConfigurationError(TranslationError):
    status_code = 503


class TranslationProviderError(TranslationError):
    status_code = 502
    public_message = 'LibreTranslate is temporarily unavailable. Please try again.'


def normalize_language(value, *, field_name, required=True):
    if value is None or value == '':
        if required:
            raise TranslationValidationError(f'{field_name} must be en or fr.')
        return None
    language = str(value).strip().lower()
    if language in {'en-us', 'en-gb'}:
        language = 'en'
    if language not in SUPPORTED_LANGUAGES:
        raise TranslationValidationError(f'{field_name} must be en or fr.')
    return language


def validate_text(text):
    if text is None:
        raise TranslationValidationError('text is required.')
    cleaned = str(text).strip()
    if not cleaned:
        raise TranslationValidationError('text cannot be empty.')
    if len(cleaned) > MAX_TRANSLATION_LENGTH:
        raise TranslationValidationError(f'text is too long. Maximum length is {MAX_TRANSLATION_LENGTH} characters.')
    return cleaned


def _cache_key(text, target_lang, source_lang):
    source = source_lang or 'auto'
    digest = hashlib.sha256(f'{source}:{target_lang}:{text}'.encode('utf-8')).hexdigest()
    return f'libretranslate:{digest}'


def _with_original_whitespace(original, translated):
    match = re.match(r'^(\s*)([\s\S]*?)(\s*)$', str(original))
    if not match:
        return translated
    return f'{match.group(1)}{translated.strip()}{match.group(3)}'


def _replace_terms(value, term_map):
    translated = value
    for source, target in sorted(term_map.items(), key=lambda item: len(item[0]), reverse=True):
        pattern = re.compile(rf'(?<![\wÀ-ÿ]){re.escape(source)}(?![\wÀ-ÿ])', re.IGNORECASE)
        translated = pattern.sub(target, translated)
    return translated


def apply_system_terms(original_text, translated_text, target_lang):
    source_text = str(original_text).strip()
    term_map = SYSTEM_TERMS_EN_FR if target_lang == 'fr' else SYSTEM_TERMS_FR_EN

    for source, target in term_map.items():
        if source_text.lower() == source.lower():
            return _with_original_whitespace(original_text, target)

    return _replace_terms(translated_text, term_map)


def get_libretranslate_url():
    endpoint = os.environ.get('LIBRETRANSLATE_URL', DEFAULT_LIBRETRANSLATE_URL).strip() or DEFAULT_LIBRETRANSLATE_URL
    return endpoint.rstrip('/')


def _local_fallback_translation(original_text, target_lang, source_lang=None):
    if source_lang and source_lang == target_lang:
        return str(original_text)
    term_map = SYSTEM_TERMS_EN_FR if target_lang == 'fr' else SYSTEM_TERMS_FR_EN
    translated = _replace_terms(str(original_text), term_map)
    return _with_original_whitespace(original_text, translated)


def _fallback_result(cleaned_text, target, source, error=None):
    if error:
        logger.warning('Using local translation fallback because LibreTranslate is unavailable: %s', error)
    return {
        'translatedText': _local_fallback_translation(cleaned_text, target, source),
        'sourceLang': source or 'auto',
        'targetLang': target,
        'provider': 'LibreTranslate',
        'cached': False,
        'fallback': True,
        'detail': 'LibreTranslate is temporarily unavailable; EduIgnite returned bundled system-term translations.',
    }


def _extract_detected_language(data, fallback_source):
    if fallback_source:
        return fallback_source

    detected = data.get('detectedLanguage') or data.get('detected_language')
    if isinstance(detected, dict):
        detected = detected.get('language')
    if isinstance(detected, str):
        detected = detected.strip().lower()
        if detected in SUPPORTED_LANGUAGES:
            return detected
    return 'auto'


def _perform_libretranslate_request(text, target_lang, source_lang=None):
    payload = {
        'q': text,
        'source': source_lang or 'auto',
        'target': target_lang,
        'format': 'text',
    }
    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        f'{get_libretranslate_url()}/translate',
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    last_error = None
    for attempt in range(1, MAX_TRANSLATION_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=DEFAULT_REQUEST_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode('utf-8'))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < MAX_TRANSLATION_ATTEMPTS:
                time.sleep(0.2 * attempt)

    logger.exception('LibreTranslate request failed after retries', exc_info=last_error)
    raise TranslationProviderError() from last_error


def translate_text(text, target_lang, source_lang=None):
    target = normalize_language(target_lang, field_name='targetLang')
    source = normalize_language(source_lang, field_name='sourceLang', required=False)
    cleaned_text = validate_text(text)

    key = _cache_key(cleaned_text, target, source)
    cached = cache.get(key)
    if cached:
        return {**cached, 'cached': True}

    try:
        data = _perform_libretranslate_request(cleaned_text, target, source)
    except (TranslationConfigurationError, TranslationProviderError) as exc:
        result = _fallback_result(cleaned_text, target, source, exc)
        cache.set(key, result, FALLBACK_TRANSLATION_CACHE_TIMEOUT)
        return result

    translated = data.get('translatedText')
    if not translated:
        result = _fallback_result(
            cleaned_text,
            target,
            source,
            TranslationProviderError('LibreTranslate returned an empty translation. Please try again.'),
        )
        cache.set(key, result, FALLBACK_TRANSLATION_CACHE_TIMEOUT)
        return result

    result = {
        'translatedText': apply_system_terms(cleaned_text, translated, target),
        'sourceLang': _extract_detected_language(data, source),
        'targetLang': target,
        'provider': 'LibreTranslate',
        'cached': False,
    }
    cache.set(key, result, TRANSLATION_CACHE_TIMEOUT)
    return result


def translate_many(texts, target_lang, source_lang=None):
    if not isinstance(texts, list):
        raise TranslationValidationError('texts must be a list.')
    return [translate_text(text, target_lang, source_lang) for text in texts]
