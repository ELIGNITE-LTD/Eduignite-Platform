"""Career orientation AI service."""
import json
import logging

from .service_utils import extract_json_payload
from .utils import call_groq_api
from .validators import validate_career_report

logger = logging.getLogger(__name__)


CAREER_REPORT_SCHEMA = {
    'career_overview': 'string',
    'subjects_to_focus': ['list of subject names'],
    'secondary_preparation': 'string',
    'exam_requirements': ['list of required exams/certifications'],
    'recommended_universities': [
        {
            'name': 'string',
            'country': 'string',
            'program': 'string',
            'duration_years': 0,
            'website': 'string',
            'note': 'Verify admission requirements directly with the university.',
        }
    ],
    'degree_duration': 'string',
    'career_opportunities': ['list of job roles'],
    'important_skills': ['list of skills'],
    'step_by_step_roadmap': [
        {'step': 1, 'title': 'string', 'description': 'string', 'timeline': 'string'}
    ],
    'future_recommendations': 'string',
}


def _language_is_french(data: dict) -> bool:
    return str(data.get('response_language') or '').lower().startswith('fr')


def _fallback_career_report(data: dict, reason: str = '') -> dict:
    desired = data.get('desired_career') or 'your chosen career'
    education_level = data.get('education_level') or 'Secondary'
    subjects = data.get('favorite_subjects') or []
    focus_subjects = subjects[:4] or ['Mathematics', 'English', 'French', 'Computer Science']

    if _language_is_french(data):
        overview = (
            f'Votre objectif de devenir {desired} est réalisable avec une préparation structurée, '
            f'des résultats solides et une vérification régulière des conditions d’admission.'
        )
        secondary_preparation = (
            f'Au niveau {education_level}, concentrez-vous sur les matières principales, les travaux pratiques, '
            'la discipline personnelle et la préparation aux examens officiels camerounais.'
        )
        exam_requirements = [
            'Résultats solides au GCE, au Baccalauréat ou à l’examen équivalent selon le sous-système.',
            'Dossier académique complet avec relevés de notes et pièces d’identité.',
            'Vérification directe des exigences de chaque université avant toute candidature.',
        ]
        career_opportunities = [
            f'Assistant ou stagiaire dans le domaine {desired}',
            f'Professionnel junior en {desired}',
            'Entrepreneuriat ou spécialisation après des études supérieures',
        ]
        important_skills = ['Communication', 'Recherche', 'Résolution de problèmes', 'Discipline', 'Travail en équipe']
        roadmap = [
            {'step': 1, 'title': 'Clarifier le parcours', 'description': f'Confirmez les matières et diplômes exigés pour {desired}.', 'timeline': 'Cette semaine'},
            {'step': 2, 'title': 'Renforcer les matières clés', 'description': 'Établissez un programme hebdomadaire de révision et suivez vos notes.', 'timeline': '1 à 3 mois'},
            {'step': 3, 'title': 'Préparer le dossier', 'description': 'Rassemblez relevés, certificats, lettres et informations d’admission.', 'timeline': '3 à 6 mois'},
            {'step': 4, 'title': 'Candidater et vérifier', 'description': 'Contactez directement les établissements pour confirmer les conditions.', 'timeline': 'Avant les délais officiels'},
        ]
        future = (
            'Cette orientation de secours a été générée lorsque le service IA était indisponible ou trop lent. '
            'Utilisez-la comme base, puis relancez l’IA pour une version plus détaillée.'
        )
        universities = [
            {'name': 'University of Buea', 'country': 'Cameroon', 'program': f'Programme lié à {desired} à vérifier', 'duration_years': 3, 'website': 'https://www.ubuea.cm', 'note': 'Verify admission requirements directly with the university.'},
            {'name': 'University of Yaounde I', 'country': 'Cameroon', 'program': f'Programme lié à {desired} à vérifier', 'duration_years': 3, 'website': 'https://www.uy1.uninet.cm', 'note': 'Verify admission requirements directly with the university.'},
            {'name': 'University of Douala', 'country': 'Cameroon', 'program': f'Programme lié à {desired} à vérifier', 'duration_years': 3, 'website': 'https://www.univ-douala.cm', 'note': 'Verify admission requirements directly with the university.'},
        ]
    else:
        overview = (
            f'Your goal of becoming a {desired} is realistic with structured preparation, strong results, '
            'and direct verification of admission requirements.'
        )
        secondary_preparation = (
            f'At {education_level} level, focus on core subjects, practical work, disciplined revision, '
            'and preparation for Cameroon official examinations.'
        )
        exam_requirements = [
            'Strong GCE, Baccalaureate, or equivalent official examination results for your subsystem.',
            'Complete academic file with transcripts, certificates, and identification documents.',
            'Direct verification of admission requirements with each university before applying.',
        ]
        career_opportunities = [
            f'Assistant or intern in the {desired} field',
            f'Junior professional pathway in {desired}',
            'Entrepreneurship or specialization after higher education',
        ]
        important_skills = ['Communication', 'Research', 'Problem solving', 'Discipline', 'Teamwork']
        roadmap = [
            {'step': 1, 'title': 'Clarify the pathway', 'description': f'Confirm the subjects and qualifications required for {desired}.', 'timeline': 'This week'},
            {'step': 2, 'title': 'Strengthen core subjects', 'description': 'Set a weekly revision timetable and track your scores.', 'timeline': '1 to 3 months'},
            {'step': 3, 'title': 'Prepare your application file', 'description': 'Collect transcripts, certificates, letters, and admission information.', 'timeline': '3 to 6 months'},
            {'step': 4, 'title': 'Apply and verify', 'description': 'Contact institutions directly to confirm requirements and deadlines.', 'timeline': 'Before official deadlines'},
        ]
        future = (
            'This starter roadmap was generated because the AI provider was unavailable or too slow. '
            'Use it as a safe starting point and regenerate later for a richer AI report.'
        )
        universities = [
            {'name': 'University of Buea', 'country': 'Cameroon', 'program': f'{desired} related program to verify', 'duration_years': 3, 'website': 'https://www.ubuea.cm', 'note': 'Verify admission requirements directly with the university.'},
            {'name': 'University of Yaounde I', 'country': 'Cameroon', 'program': f'{desired} related program to verify', 'duration_years': 3, 'website': 'https://www.uy1.uninet.cm', 'note': 'Verify admission requirements directly with the university.'},
            {'name': 'University of Douala', 'country': 'Cameroon', 'program': f'{desired} related program to verify', 'duration_years': 3, 'website': 'https://www.univ-douala.cm', 'note': 'Verify admission requirements directly with the university.'},
        ]

    if reason:
        logger.warning('Using fallback career report: %s', reason)

    return {
        'career_overview': overview,
        'subjects_to_focus': focus_subjects,
        'secondary_preparation': secondary_preparation,
        'exam_requirements': exam_requirements,
        'recommended_universities': universities,
        'degree_duration': '3 to 5 years depending on the program and institution.',
        'career_opportunities': career_opportunities,
        'important_skills': important_skills,
        'step_by_step_roadmap': roadmap,
        'future_recommendations': future,
    }


def _complete_report(report_obj, parsed: dict, result: dict | None = None):
    report_obj.report_data = parsed
    report_obj.status = 'completed'
    report_obj.error_message = ''
    report_obj.save(update_fields=['report_data', 'status', 'error_message', 'updated_at'])
    if report_obj.ai_request_id:
        report_obj.ai_request.mark_completed(
            response=json.dumps(parsed),
            tokens_used=(result or {}).get('tokens_used', 0),
            processing_time_ms=(result or {}).get('processing_time_ms', 0),
        )


def build_career_prompt(data: dict) -> str:
    subjects = ', '.join(data.get('favorite_subjects', [])) or 'Not specified'
    uni_country = data.get('preferred_university_country') or data.get('country', 'Cameroon')
    language = data.get('response_language') or 'English'

    return f"""You are EduIgnite Career Counselor AI, expert in Cameroonian and international education paths.

A student requested career orientation guidance. Produce a high-quality but concise report quickly.

STUDENT PROFILE:
- Desired Career: {data['desired_career']}
- Current Education Level: {data['education_level']}
- Country: {data.get('country', 'Cameroon')}
- Favorite Subjects: {subjects}
- Strengths: {data.get('strengths') or 'Not specified'}
- Career Goals: {data.get('career_goals') or 'Not specified'}
- Preferred University Country: {uni_country}
- Study Style Preference: {data.get('preferred_study_style') or 'Any'}
- Budget Level: {data.get('budget_level') or 'Medium'}

INSTRUCTIONS:
1. Recommend 3 universities that genuinely exist and are relevant for this program.
2. Every university entry must include a note saying: "Verify admission requirements directly with the university."
3. Do not invent guaranteed admission claims. If uncertain, say the student must verify with the institution.
4. Suggest subjects relevant to the Cameroon secondary curriculum, including GCE or Baccalaureat where appropriate.
5. Be encouraging but realistic.
6. Respond in {language}. If the user wrote in French, use formal French.
7. Keep each string direct and useful; avoid long paragraphs.

Return ONLY valid JSON matching this schema:
{json.dumps(CAREER_REPORT_SCHEMA, indent=2)}"""


def generate_career_report(report_obj):
    data = {
        'desired_career': report_obj.desired_career,
        'education_level': report_obj.education_level,
        'country': report_obj.country,
        'favorite_subjects': report_obj.favorite_subjects,
        'strengths': report_obj.strengths,
        'career_goals': report_obj.career_goals,
        'preferred_university_country': report_obj.preferred_university_country,
        'preferred_study_style': report_obj.preferred_study_style,
        'budget_level': report_obj.budget_level,
        'response_language': report_obj.response_language,
    }
    prompt = build_career_prompt(data)

    if report_obj.ai_request_id:
        report_obj.ai_request.status = 'processing'
        report_obj.ai_request.prompt = prompt
        report_obj.ai_request.save(update_fields=['status', 'prompt', 'updated_at'])

    try:
        result = call_groq_api(
            prompt,
            max_tokens=1400,
            purpose='career_orientation',
            response_format={'type': 'json_object'},
        )
    except Exception as exc:  # noqa: BLE001 - return a safe report instead of a stalled assessment.
        result = {'success': False, 'error': str(exc), 'tokens_used': 0, 'processing_time_ms': 0}

    if not result['success']:
        error = result.get('error', 'Career report generation failed.')
        parsed = _fallback_career_report(data, error)
        _complete_report(report_obj, parsed, result)
        return True, None

    try:
        parsed = extract_json_payload(result['response'])
        valid, validation_error = validate_career_report(parsed)
        if not valid:
            raise ValueError(validation_error)
        _complete_report(report_obj, parsed, result)
        return True, None
    except Exception as exc:  # noqa: BLE001 - returned as user-facing failed status.
        logger.exception('Career report AI response could not be parsed')
        parsed = _fallback_career_report(data, f'Invalid career report response: {exc}')
        _complete_report(report_obj, parsed, result)
        return True, None
