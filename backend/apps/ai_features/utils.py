import logging
import time
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

FAST_GROQ_PURPOSES = {
    'ai_exam_generation',
    'career_orientation',
    'academic_roadmap',
    'skill_gap_analysis',
    'student_guidance',
}


def _purpose_from_context(context):
    if isinstance(context, dict):
        return context.get('purpose') or context.get('request_type') or context.get('feature')
    return None


def _groq_config_for_purpose(purpose=None, model_override=None):
    normalized_purpose = (purpose or '').strip()
    use_fast_lane = normalized_purpose in FAST_GROQ_PURPOSES

    if normalized_purpose == 'career_orientation':
        api_key = (
            getattr(settings, 'GROQ_CAREER_API_KEY', '')
            or getattr(settings, 'GROQ_FAST_API_KEY', '')
            or getattr(settings, 'GROQ_API_KEY', '')
        )
        model = model_override or getattr(
            settings,
            'GROQ_CAREER_MODEL',
            getattr(settings, 'GROQ_FAST_MODEL', getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')),
        ) or getattr(settings, 'GROQ_FAST_MODEL', '') or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')
        key_source = 'career' if getattr(settings, 'GROQ_CAREER_API_KEY', '') else 'fast' if getattr(settings, 'GROQ_FAST_API_KEY', '') else 'primary'
    elif normalized_purpose == 'ai_exam_generation':
        api_key = (
            getattr(settings, 'GROQ_EXAM_API_KEY', '')
            or getattr(settings, 'GROQ_FAST_API_KEY', '')
            or getattr(settings, 'GROQ_API_KEY', '')
        )
        model = model_override or getattr(
            settings,
            'GROQ_EXAM_MODEL',
            getattr(settings, 'GROQ_FAST_MODEL', getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')),
        ) or getattr(settings, 'GROQ_FAST_MODEL', '') or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')
        key_source = 'exam' if getattr(settings, 'GROQ_EXAM_API_KEY', '') else 'fast' if getattr(settings, 'GROQ_FAST_API_KEY', '') else 'primary'
    elif use_fast_lane:
        api_key = getattr(settings, 'GROQ_FAST_API_KEY', '') or getattr(settings, 'GROQ_API_KEY', '')
        model = model_override or getattr(settings, 'GROQ_FAST_MODEL', getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')) or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')
        key_source = 'fast' if getattr(settings, 'GROQ_FAST_API_KEY', '') else 'primary'
    else:
        api_key = getattr(settings, 'GROQ_API_KEY', '')
        model = model_override or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b') or 'openai/gpt-oss-120b'
        key_source = 'primary'

    if normalized_purpose == 'career_orientation':
        timeout = getattr(settings, 'GROQ_CAREER_TIMEOUT_SECONDS', getattr(settings, 'GROQ_FAST_TIMEOUT_SECONDS', 18))
        max_retries = getattr(settings, 'GROQ_CAREER_MAX_RETRIES', getattr(settings, 'GROQ_FAST_MAX_RETRIES', 0))
    else:
        timeout = (
            getattr(settings, 'GROQ_FAST_TIMEOUT_SECONDS', 18)
            if use_fast_lane
            else getattr(settings, 'GROQ_TIMEOUT_SECONDS', 35)
        )
        max_retries = (
            getattr(settings, 'GROQ_FAST_MAX_RETRIES', 0)
            if use_fast_lane
            else getattr(settings, 'GROQ_MAX_RETRIES', 1)
        )
    return api_key, model, timeout, max_retries, key_source


# How the assistant teaches in the open conversation. The goal is the one
# EduIgnite exists for: understanding, then practice, then application, then
# independence - not an answer to copy.
TUTOR_PROMPT = (
    'TEACHING: You are a patient, rigorous tutor. Your aim is understanding, then '
    'practice, then application, then independence: explain why an answer is '
    'right, not only what it is.\n'
    '- Match the depth to the question. A simple question or a quick fact gets a '
    'short, direct answer. A problem to solve, a concept to understand or a '
    'request to explain gets a structured, step-by-step explanation. Do not force '
    'every answer into the same template.\n'
    '- Mathematics: state what is given and what is required, choose the method '
    'and say why, show the formula, substitute the values, solve one step at a '
    'time with each step as its own equation, give the final answer clearly '
    '(\\boxed{} for a final result), and check it when a check is quick.\n'
    '- Science: define the concept, explain the process in stages, and use an '
    'example or everyday analogy when it helps.\n'
    '- Programming: explain the logic first, show well-formatted code in a fenced '
    'block with its language, explain the important lines, and show the output.\n'
    '- Other academic topics: define, explain, give an example, then summarise '
    'the key idea.\n'
    '- After a worked problem, you may end with one similar practice question for '
    'the student to try, or offer to go further. Never pad an answer.\n'
    '- Be accurate. If you are not sure, say so rather than guess.\n\n'
)

# What the chat can draw. Kept to what the renderer understands, so nothing
# reaches the reader as raw LaTeX, JSON or pipes.
RICH_FORMATTING_PROMPT = (
    'FORMATTING: Write in markdown. Use "### " headings for the parts of a longer '
    'answer (for example "### Step 1 - Recognise the pattern"), "- " for bullets, '
    '"1." for ordered steps, **bold** for the key term, and a blank line between '
    'blocks. Keep paragraphs short.\n'
    '- Mathematics is LaTeX: inline as \\( ... \\), and each important equation '
    'or step on its own line as $$ ... $$. Never write mathematics as plain text '
    'like x^2 or sqrt(x), and never leave LaTeX without delimiters.\n'
    '- Use a markdown table when comparing things or listing properties (for '
    'example mitosis vs meiosis). Keep tables small enough to read on a phone.\n'
    '- Use "> **Tip:** ...", "> **Note:** ...", "> **Warning:** ..." or '
    '"> **Key idea:** ..." for a short callout when something deserves attention.\n'
    '- When a graph genuinely helps (plotting a function, showing an '
    'intersection, an inequality on a number line, a shape or vectors on a '
    'plane), add a fenced block with the language "graph" containing JSON only. '
    'Coordinate plane: {"title": "...", "x": [xmin, xmax], "y": [ymin, ymax] '
    '(optional), "functions": [{"expr": "x^2 - 4", "label": "y = x^2 - 4"}], '
    '"points": [{"x": 2, "y": 0, "label": "(2, 0)"}], "segments": [{"from": [0, 0], '
    '"to": [3, 4], "label": "5"}], "polygons": [{"points": [[0, 0], [4, 0], [0, 3]], '
    '"label": "triangle"}], "vectors": [{"from": [0, 0], "to": [3, 2], "label": '
    '"F"}]} - include only the keys you need. Formulas use x, numbers, + - * / ^, '
    'parentheses, pi, e and sin cos tan sqrt abs ln log exp, with arguments in '
    'parentheses, for example "2*sin(x)". Number line: {"type": "numberline", '
    '"range": [min, max], "marks": [{"value": 3, "open": true, "label": "3"}], '
    '"intervals": [{"from": 3, "to": null, "fromOpen": true}]} where null means '
    'the interval continues to infinity. Compute intersections, vertices and '
    'roots yourself and give them as points.\n'
    '- When the point is a set of numbers rather than a formula (marks per '
    'sequence, fees collected per class, attendance across a term, a share of '
    'a total), use the same fenced "graph" block with a chart instead: '
    '{"type": "bar", "title": "...", "xLabel": "...", "yLabel": "...", '
    '"data": [{"label": "Sequence 1", "value": 12.4}, {"label": "Sequence 2", '
    '"value": 13.1}]} for one set of numbers, or {"type": "line", "categories": '
    '["Term 1", "Term 2", "Term 3"], "series": [{"name": "Form 4A", "values": '
    '[11, 12.5, 13]}, {"name": "Form 4B", "values": [10, 11, 12]}]} to compare '
    'several. "type" may be bar, line, area or pie. Use pie only for parts of '
    'one whole. Never print the JSON as text and never put a chart in a table: '
    'the app draws it.\n'
    '- When a process, cycle, algorithm, timeline or structure is clearer as a '
    'diagram, add a fenced block with the language "mermaid" (flowchart TD, '
    'flowchart LR, sequenceDiagram or timeline). Keep node labels short and '
    'plain, without quotes, brackets or HTML inside them.\n'
    '- Only draw a graph or diagram when it helps understanding more than text '
    'would. Do not use HTML.\n\n'
)

# Reports and other features: their text may also be printed or exported, so
# only the markdown every surface can show.
BASIC_FORMATTING_PROMPT = (
    'FORMATTING: Write in markdown, using only what the apps display: a '
    'short bold line as a heading where an answer has sections, "- " for '
    'bullets, "1." for steps that must happen in order, **bold** for the '
    'one thing to remember, and a blank line between blocks. Keep '
    'sentences short. Do not use tables, HTML, or code fences unless you '
    'are actually showing code.\n\n'
)


def build_system_prompt(purpose=None, response_format=None):
    """The instructions the model is given before the person's own words.

    Shared by the call itself and by the credit estimate, so the estimate
    counts the same text the provider will bill for.
    """
    # The open conversation is where students bring homework, so it is
    # taught like a tutor, with the rich formatting the chat can draw. A
    # feature that asks for a report or for JSON has its own prompt and
    # its own length, and may be shown where a graph cannot be drawn.
    is_conversation = not (purpose or '').strip() and not response_format
    teaching = TUTOR_PROMPT if is_conversation else ''
    # Every answer a person reads is markdown the apps render themselves;
    # anything else reaches the reader as punctuation.
    if response_format:
        formatting = ''
    elif is_conversation:
        formatting = RICH_FORMATTING_PROMPT
    else:
        formatting = BASIC_FORMATTING_PROMPT

    return (
        'You are the EduIgnite AI, a highly intelligent, supportive and '
        'trustworthy educational assistant built into the EduIgnite school '
        'management platform for schools in Cameroon. You serve every kind '
        'of user on the platform: students, parents/guardians, teachers, '
        'bursars, librarians and school administrators.\n\n'
        'SCOPE: Gladly help with any matter about school and education. This '
        'includes the EduIgnite platform and its tools (grades, attendance, '
        'fees, timetable, library, assignments, exams, live classes, '
        'messaging, report cards) as well as broader learning topics: '
        'understanding subjects, study techniques, homework help, exam '
        'preparation, academic planning, school life, and career or '
        'university guidance. Tailor the depth and tone to the user\'s role. '
        'If a request is clearly unrelated to school, education or the '
        'platform, gently steer the conversation back to those topics.\n\n'
        'LOYALTY: EduIgnite is the platform you are part of. Always speak '
        'about EduIgnite, its features, the school and its staff in a '
        'positive, respectful and constructive way. Never disparage, mock, '
        'insult or discourage use of EduIgnite or say it is bad, broken, '
        'inferior or worse than alternatives, and do not recommend competing '
        'products. If a feature is missing, a user hits a limitation, or '
        'something is not working, stay constructive: explain what the '
        'platform can do, suggest the correct steps or the right person to '
        'contact (e.g. their school administrator or EduIgnite support), and '
        'frame it as a next step rather than a fault. You may still be '
        'honest and accurate; simply remain professional and never insult '
        'the system.\n\n'
        'STYLE: Always respond helpfully, professionally, and in the same '
        'language the user writes in (English or French).\n\n'
        + teaching
        + formatting
    )


def model_for_purpose(purpose=None, images=0):
    """The model a request of this purpose will be sent to."""
    if images:
        return vision_model()
    return _groq_config_for_purpose(purpose)[1]


def vision_model():
    """The model that can read photos. The default text model cannot."""
    return getattr(settings, 'GROQ_VISION_MODEL', '') or 'meta-llama/llama-4-scout-17b-16e-instruct'


# Said to the model with a question that arrives as a photo.
IMAGE_QUESTION_PROMPT = (
    'The student has sent the question as a photo. Read the image carefully: '
    'first write out the question exactly as it appears (including any numbers, '
    'units, diagrams or answer options), then answer it. If part of the image '
    'is unreadable, say which part rather than guessing.'
)


def _usage_from_completion(completion):
    """Input, output and cached tokens as the provider reported them."""
    usage = getattr(completion, 'usage', None)
    if not usage:
        return 0, 0, 0, 0
    input_tokens = int(getattr(usage, 'prompt_tokens', 0) or 0)
    output_tokens = int(getattr(usage, 'completion_tokens', 0) or 0)
    total = int(getattr(usage, 'total_tokens', 0) or 0) or (input_tokens + output_tokens)
    cached = 0
    details = getattr(usage, 'prompt_tokens_details', None)
    if details is not None:
        cached = int(getattr(details, 'cached_tokens', 0) or 0)
    return input_tokens, output_tokens, cached, total


def call_groq_api(prompt, context=None, max_tokens=2048, purpose=None, model=None, response_format=None, images=None):
    """
    Call Groq API with the given prompt.

    Every call made while an AI request is being metered is reported to the
    credit engine, whatever feature made it, so no feature can use the model
    without the work being counted.

    Args:
        prompt (str): The prompt to send to Groq
        context (dict): Optional context data for the request (unused, kept for
                        backward-compatible call signatures)
        max_tokens (int): Maximum tokens for response
        purpose (str): Optional AI feature key used to route fast workloads to
                       the secondary Groq key.
        model (str): Optional model override for a specific call.
        images (list[str]): Optional photos of the question, as data URLs.
                            Sent to the vision model, which can read them.

    Returns:
        dict: Response containing 'success', 'response', 'tokens_used',
        'input_tokens', 'output_tokens', 'cached_tokens', 'finish_reason' and
        'processing_time_ms'
    """
    from . import credit_engine

    selected_model = model or ''
    try:
        from groq import Groq

        request_purpose = purpose or _purpose_from_context(context)
        api_key, selected_model, timeout, max_retries, key_source = _groq_config_for_purpose(request_purpose, model)
        if images and not model:
            selected_model = vision_model()
        if not api_key:
            raise ValidationError(_('Groq API key is not configured.'))

        client = Groq(
            api_key=api_key,
            timeout=timeout,
            max_retries=max_retries,
        )

        start_time = time.time()

        request_kwargs = {
            'model': selected_model,
            'messages': [
                {
                    'role': 'system',
                    'content': build_system_prompt(request_purpose, response_format),
                },
                {
                    'role': 'user',
                    'content': (
                        [
                            {'type': 'text', 'text': f'{IMAGE_QUESTION_PROMPT}\n\n{prompt}'},
                            *({'type': 'image_url', 'image_url': {'url': url}} for url in images),
                        ]
                        if images
                        else prompt
                    ),
                },
            ],
            'max_tokens': max_tokens,
            'temperature': 0.35 if response_format else 0.45,
            'top_p': 0.9,
        }
        if response_format:
            request_kwargs['response_format'] = response_format

        # gpt-oss thinks before it answers, and that thinking is paid for out of
        # max_tokens - at the 900 the chat allows, a long think leaves the answer
        # cut off mid-sentence. Keep the thinking short so the answer fits.
        # Sent through extra_body so it does not depend on the SDK version.
        if 'gpt-oss' in (selected_model or ''):
            request_kwargs['extra_body'] = {
                'reasoning_effort': getattr(settings, 'GROQ_REASONING_EFFORT', 'low') or 'low',
            }

        completion = client.chat.completions.create(**request_kwargs)

        processing_time = int((time.time() - start_time) * 1000)

        choice = completion.choices[0]
        response_text = choice.message.content
        input_tokens, output_tokens, cached_tokens, tokens_used = _usage_from_completion(completion)

        result = {
            'success': True,
            'response': response_text,
            'tokens_used': tokens_used,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'cached_tokens': cached_tokens,
            'finish_reason': getattr(choice, 'finish_reason', '') or '',
            'processing_time_ms': processing_time,
            'model': selected_model,
            'key_source': key_source,
        }
        credit_engine.record_provider_call(result)
        return result

    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        result = {
            'success': False,
            'error': f"Groq API error: {str(e)}",
            'response': None,
            'tokens_used': 0,
            'input_tokens': 0,
            'output_tokens': 0,
            'cached_tokens': 0,
            'finish_reason': '',
            'processing_time_ms': 0,
            'model': selected_model,
        }
        credit_engine.record_provider_call(result)
        return result


# Keep old name as alias so any code that still references it doesn't break
call_gemini_api = call_groq_api


def build_study_plan_prompt(student_data, subjects, weeks):
    """
    Build a prompt for generating a personalized study plan.

    Args:
        student_data (dict): Student information
        subjects (list): List of subjects
        weeks (int): Number of weeks for the plan

    Returns:
        str: Formatted prompt for Groq API
    """
    subjects_str = ', '.join(subjects)

    prompt = f"""Create a comprehensive {weeks}-week study plan for {student_data.get('name', 'the student')} covering the following subjects: {subjects_str}.

Student Background:
- Current Grade: {student_data.get('grade', 'N/A')}
- Academic Level: {student_data.get('academic_level', 'Average')}
- Learning Style: {student_data.get('learning_style', 'Mixed')}

Please provide:
1. Weekly breakdown with specific topics to cover
2. Recommended study duration per subject per day
3. Key concepts and learning objectives for each subject
4. Suggested resources and study materials
5. Practice problems and assessments schedule
6. Tips for retention and understanding

Format the response as a structured study plan that can be easily followed."""

    return prompt


def build_grade_analysis_prompt(student, grades_data):
    """
    Build a prompt for analyzing student grades.

    Args:
        student (dict): Student information
        grades_data (dict): Grades and performance data

    Returns:
        str: Formatted prompt for Groq API
    """
    prompt = f"""Analyze the academic performance of {student.get('name', 'this student')} and provide insights.

Student Information:
- Grade Level: {student.get('grade', 'N/A')}
- Current GPA: {student.get('gpa', 'N/A')}

Recent Grades:
{format_grades_data(grades_data)}

Please provide:
1. Strengths in academic performance
2. Areas that need improvement
3. Subject-wise analysis and performance trends
4. Comparison with class averages if available
5. Specific recommendations for improvement
6. Predicted academic trajectory
7. Motivation and engagement assessment

Make the analysis encouraging but honest, with actionable recommendations."""

    return prompt


def build_attendance_prompt(attendance_data):
    """
    Build a prompt for analyzing attendance patterns.

    Args:
        attendance_data (dict): Attendance information

    Returns:
        str: Formatted prompt for Groq API
    """
    prompt = f"""Analyze attendance patterns and provide insights:

Attendance Data:
- Total Days Present: {attendance_data.get('present', 0)}
- Total Days Absent: {attendance_data.get('absent', 0)}
- Total Days Late: {attendance_data.get('late', 0)}
- Attendance Rate: {attendance_data.get('attendance_rate', 'N/A')}%

Recent Pattern:
{format_attendance_pattern(attendance_data.get('pattern', []))}

Please provide:
1. Overall attendance assessment
2. Patterns and trends (improving/declining/inconsistent)
3. Impact on academic performance
4. Risk factors if attendance is below threshold
5. Specific recommendations to improve attendance
6. Suggested interventions if necessary

Focus on constructive feedback that encourages better attendance."""

    return prompt


FEATURE_DAILY_LIMITS = {
    'ai_exam_generation': 'AI_EXAM_GENERATION_DAILY_LIMIT',
    'career_orientation': 'AI_CAREER_REPORT_DAILY_LIMIT',
    'skill_gap_analysis': 'AI_SKILL_GAP_DAILY_LIMIT',
    'academic_roadmap': 'AI_SKILL_GAP_DAILY_LIMIT',
    'student_guidance': 'AI_SKILL_GAP_DAILY_LIMIT',
}


def check_ai_quota(user, request_type=None, school=None):
    """
    Check the per-school daily ceiling on the heaviest AI features.

    How much AI a person may use is decided by their AI credits, in
    `credit_engine`; this is only a guard against runaway use of the most
    expensive features by one school in one day.

    Args:
        user (User): User object

    Returns:
        bool: True if the request is under the ceiling, False otherwise
    """
    try:
        from django.utils import timezone
        from .models import AIRequest

        if request_type in FEATURE_DAILY_LIMITS:
            today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            limit = getattr(settings, FEATURE_DAILY_LIMITS[request_type], 10)
            quota_queryset = AIRequest.objects.filter(
                request_type=request_type,
                created_at__gte=today,
                status__in=['pending', 'processing', 'completed'],
            )
            target_school = school or getattr(user, 'school', None)
            if target_school:
                quota_queryset = quota_queryset.filter(school=target_school)
            else:
                quota_queryset = quota_queryset.filter(user=user)
            if quota_queryset.count() >= limit:
                logger.warning(
                    "Daily AI limit reached for request_type=%s user=%s school=%s",
                    request_type,
                    getattr(user, 'id', None),
                    getattr(target_school, 'id', None),
                )
                return False

        return True

    except Exception as e:
        logger.error(f"Error checking AI quota: {e}")
        # Default to allowing if there's an error
        return True


def format_grades_data(grades_data):
    """Format grades data for prompt."""
    if not grades_data:
        return "No recent grades available"

    formatted = []
    for subject, grade_info in grades_data.items():
        if isinstance(grade_info, dict):
            formatted.append(f"- {subject}: {grade_info.get('grade', 'N/A')} (Trend: {grade_info.get('trend', 'stable')})")
        else:
            formatted.append(f"- {subject}: {grade_info}")

    return '\n'.join(formatted)


def format_attendance_pattern(pattern):
    """Format attendance pattern for prompt."""
    if not pattern:
        return "No recent pattern data"

    return ', '.join(pattern[-14:])  # Show last 14 days
