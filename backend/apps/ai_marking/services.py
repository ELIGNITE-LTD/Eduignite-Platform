"""Rendering uploads, estimating the cost, and marking scripts with the AI.

Nothing here decides a mark that the teacher cannot change: the AI proposes, the teacher reviews and approves.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
import unicodedata
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.ai_features import credit_engine
from apps.ai_features.credit_pricing import tokens_for_text

from .models import MarkedScript, MarkingJob, MarkingPage

logger = logging.getLogger(__name__)

FEATURE = 'ai_marking'
MAX_PAGES = 150
PAGE_EDGE = 1600
APPROACH_TEXT = {
    'strict': 'STRICT MARKING. Award a mark only when the answer matches the marking scheme precisely (the expected '
              'result, term or value). Do not give credit for answers that are only close or vaguely right.',
    'idea_based': 'IDEA-BASED MARKING. Award the mark for each correct idea or point in the marking scheme, even when the '
                  'student words it differently from the scheme. Different wording for the same idea earns the same mark.',
    'conceptual': 'CONCEPTUAL UNDERSTANDING. Judge whether the student understands the concept. Reward correct reasoning '
                  'and explanation even if details or terminology differ from the scheme; withhold marks for memorised '
                  'statements that show no understanding.',
    'partial_credit': 'PARTIAL CREDIT. Break each question into its steps and award marks for every correct step, '
                      'including method marks when the final answer is wrong.',
    'custom': 'Follow the teacher\'s own marking instructions below.',
}


# ---------------------------------------------------------------------------
# Uploads
# ---------------------------------------------------------------------------

def _jpeg(image) -> bytes:
    from PIL import Image

    image = image.convert('RGB')
    if max(image.size) > PAGE_EDGE:
        scale = PAGE_EDGE / float(max(image.size))
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=72, optimize=True)
    return out.getvalue()


def pages_from_upload(upload) -> list[bytes]:
    """JPEG bytes of every page of a PDF or of a single photo. Anything else is refused in plain words."""
    from PIL import Image, UnidentifiedImageError

    raw = upload.read()
    if not raw:
        raise ValidationError({'files': f'{upload.name} is empty.'})
    if raw[:5] == b'%PDF-':
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=raw, filetype='pdf')
            if doc.needs_pass:
                raise ValidationError({'files': f'{upload.name} is password protected.'})
            if doc.page_count > MAX_PAGES:
                raise ValidationError({'files': f'{upload.name} has more than {MAX_PAGES} pages. Split it into smaller files.'})
            out = []
            for page in doc:
                pix = page.get_pixmap(dpi=110)
                out.append(_jpeg(Image.frombytes('RGB', (pix.width, pix.height), pix.samples)))
            return out
        except ValidationError:
            raise
        except Exception:  # noqa: BLE001
            raise ValidationError({'files': f'{upload.name} could not be read as a PDF.'})
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            return [_jpeg(image)]
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise ValidationError({'files': f'{upload.name} is not a PDF or a photo (JPG, PNG, WebP).'})


def data_url(raw: bytes) -> str:
    return 'data:image/jpeg;base64,' + base64.b64encode(raw).decode()


# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------

def estimate_for(job: MarkingJob):
    """What marking this job will roughly cost, before anything is sent."""
    scripts = max(job.script_count, 1)
    scheme_pages = job.pages.filter(kind=MarkingPage.SCHEME).count()
    scheme_tokens = tokens_for_text(job.scheme_text) if job.scheme_text else 700 * scheme_pages
    # Every script is sent with the scheme and the instructions; each answer is about a page of marks and comments.
    sent = scripts * (scheme_tokens + tokens_for_text(job.custom_instructions) + 450)
    output = scripts * 1500 + (900 * scheme_pages if scheme_pages and not job.scheme_text else 0)
    return credit_engine.estimate_request(
        FEATURE, purpose=FEATURE, input_tokens=sent, expected_output_tokens=output,
        images=job.page_count,
    )


# ---------------------------------------------------------------------------
# Prompts and parsing
# ---------------------------------------------------------------------------

def _prompt(job: MarkingJob, scheme: str) -> str:
    approach = APPROACH_TEXT.get(job.approach, APPROACH_TEXT['idea_based'])
    extra = f'\nTeacher\'s instructions:\n{job.custom_instructions.strip()}\n' if job.custom_instructions.strip() else ''
    return (
        'You are an experienced examiner marking one student\'s handwritten or typed exam script (the attached pictures, in '
        'page order) against the marking scheme below. Be fair, consistent and specific.\n\n'
        f'MARKING APPROACH: {approach}\n{extra}\n'
        f'The paper is out of {job.paper_total} marks in total.\n\n'
        f'MARKING SCHEME:\n{scheme.strip() or "(none given: mark from your own knowledge of the subject and be careful)"}\n\n'
        'Read the student\'s name and matricule/ID from the top of the script if they are written there. '
        'For every question: give the maximum marks, the marks you award (never more than the maximum), what the student '
        'actually wrote (briefly, in their words), a short comment explaining the mark, and the correct answer or '
        'correction when the student lost marks. Say so honestly when handwriting is unreadable and award nothing for '
        'what you cannot read. Do not invent answers.\n\n'
        'Reply with ONLY this JSON object:\n'
        '{"student_name": "", "student_matricule": "", "questions": [{"no": "1", "max": 0, "awarded": 0, '
        '"student_answer": "", "comment": "", "correction": ""}], "feedback": "two or three sentences of overall feedback '
        'that help the student improve"}'
    )


def _extract_json(text: str) -> dict:
    text = (text or '').strip()
    text = re.sub(r'^```(?:json)?|```$', '', text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end < start:
        raise ValueError('The answer was not JSON.')
    return json.loads(text[start:end + 1])


def _dec(value, default='0') -> Decimal:
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def clean_questions(raw) -> list[dict]:
    """Marks the AI returned, made safe: numbers, never above the maximum, never negative."""
    out = []
    for i, q in enumerate(raw if isinstance(raw, list) else [], start=1):
        if not isinstance(q, dict):
            continue
        maximum = max(_dec(q.get('max')), Decimal('0'))
        awarded = min(max(_dec(q.get('awarded')), Decimal('0')), maximum) if maximum else max(_dec(q.get('awarded')), Decimal('0'))
        out.append({
            'no': str(q.get('no') or i)[:20], 'max': float(maximum), 'awarded': float(awarded),
            'student_answer': str(q.get('student_answer') or '')[:1200], 'comment': str(q.get('comment') or '')[:700],
            'correction': str(q.get('correction') or '')[:900],
        })
    return out


def total_of(questions) -> Decimal:
    return sum((Decimal(str(q['awarded'])) for q in questions), Decimal('0')).quantize(Decimal('0.01'))


def _norm(text) -> str:
    text = unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', text)).strip()


def match_student(roster, name, matricule):
    """The roster entry a script belongs to, by matricule first and then by name; None when it is not sure."""
    wanted = _norm(matricule).replace(' ', '')
    if wanted:
        for r in roster:
            if _norm(r.get('matricule')).replace(' ', '') == wanted:
                return r
    tokens = set(_norm(name).split())
    if len(tokens) >= 2:
        hits = [r for r in roster if set(_norm(r.get('name')).split()) == tokens]
        if len(hits) == 1:
            return hits[0]
        hits = [r for r in roster if len(tokens & set(_norm(r.get('name')).split())) >= 2 and tokens <= set(_norm(r.get('name')).split())]
        if len(hits) == 1:
            return hits[0]
    return None


# ---------------------------------------------------------------------------
# Marking
# ---------------------------------------------------------------------------

def _call_model(prompt: str, images: list[str], *, max_tokens: int):
    from apps.ai_features.utils import call_groq_api

    return call_groq_api(prompt, max_tokens=max_tokens, purpose=FEATURE, images=images, image_prompt='',
                         response_format={'type': 'json_object'})


def extract_scheme(job: MarkingJob) -> str:
    """Turn uploaded marking-scheme pictures into text once, so it is not read again for every script."""
    pages = [bytes(p.data) for p in job.pages.filter(kind=MarkingPage.SCHEME)]
    if not pages:
        return job.scheme_text
    result = _call_model(
        'These pictures are an exam marking scheme (expected answers and marks). Write it out completely as plain text, '
        'question by question, with the marks of each point. Do not add anything of your own.',
        [data_url(p) for p in pages], max_tokens=3500,
    )
    if not result.get('success'):
        raise RuntimeError(result.get('error') or 'The marking scheme could not be read.')
    return (result.get('response') or '').strip()


def mark_script(job: MarkingJob, scheme: str, pages: list[bytes]) -> dict:
    result = _call_model(_prompt(job, scheme), [data_url(p) for p in pages], max_tokens=3500)
    if not result.get('success'):
        raise RuntimeError(result.get('error') or 'The AI could not mark this script.')
    return _extract_json(result.get('response'))


def run_job(job_id) -> None:
    """Mark every script of a job. Runs in the background; progress is saved after each script."""
    job = MarkingJob.objects.select_related('ai_request').get(pk=job_id)
    if job.status != MarkingJob.MARKING:
        return
    ai_request = job.ai_request
    try:
        with credit_engine.metered(ai_request):
            if ai_request:
                ai_request.status = 'processing'
                ai_request.save(update_fields=['status', 'updated_at'])
            scheme = job.scheme_text or extract_scheme(job)
            if scheme != job.scheme_text:
                job.scheme_text = scheme
                job.save(update_fields=['scheme_text'])
            scripts = [bytes(p.data) for p in job.pages.filter(kind=MarkingPage.SCRIPT).order_by('index')]
            per = max(job.pages_per_script, 1)
            groups = [scripts[i:i + per] for i in range(0, len(scripts), per)]
            done_any = False
            for index, group in enumerate(groups):
                if MarkedScript.objects.filter(job=job, index=index).exists():
                    continue                      # already marked (a restarted run)
                row = MarkedScript(job=job, index=index)
                try:
                    data = mark_script(job, scheme, group)
                    questions = clean_questions(data.get('questions'))
                    if not questions:
                        raise ValueError('No questions were marked.')
                    row.questions = questions
                    row.total = total_of(questions)
                    row.feedback = str(data.get('feedback') or '')[:1500]
                    row.detected_name = str(data.get('student_name') or '')[:160]
                    row.detected_matricule = str(data.get('student_matricule') or '')[:60]
                    match = match_student(job.roster, row.detected_name, row.detected_matricule)
                    if match:
                        row.student_id = match['id']
                    maximum = sum(Decimal(str(q['max'])) for q in questions)
                    if maximum != job.paper_total:
                        row.warning = f'The questions add up to {maximum} but the paper is out of {job.paper_total}. Check the marks.'
                    done_any = True
                except Exception as exc:  # noqa: BLE001 - one bad script must not stop the others
                    logger.warning('Marking script %s of job %s failed: %s', index, job.pk, exc)
                    row.failed = True
                    row.warning = 'This script could not be marked. Mark it yourself or try again.'
                row.save()
                MarkingJob.objects.filter(pk=job.pk).update(progress=index + 1)
            if not done_any and groups:
                raise RuntimeError('None of the scripts could be marked.')
            # Completed INSIDE the meter: that is what tells the credit engine the work was delivered and is to be charged.
            if ai_request:
                ai_request.mark_completed(response=json.dumps({'scripts': len(groups)}), tokens_used=0, processing_time_ms=0)
    except Exception as exc:  # noqa: BLE001
        logger.exception('AI marking job %s failed', job_id)
        job.refresh_from_db()
        job.status, job.error = MarkingJob.FAILED, str(exc)[:500]
        job.save(update_fields=['status', 'error'])
        if ai_request:
            ai_request.mark_failed(str(exc)[:500])
        job.pages.all().delete()
        return
    job.refresh_from_db()
    job.status = MarkingJob.REVIEW
    job.save(update_fields=['status'])
    job.pages.all().delete()           # the pictures are no longer needed once marked
