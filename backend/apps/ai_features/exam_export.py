from io import BytesIO

from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone


def _school_context(school):
    return {
        'name': getattr(school, 'name', 'EduIgnite School'),
        'short_name': getattr(school, 'short_name', ''),
        'motto': getattr(school, 'motto', ''),
        'logo': getattr(school, 'logo', '') or '',
        'primary_colour': getattr(school, 'primary_colour', '') or '#1a3c6e',
        'matricule': getattr(school, 'id', ''),
        'location': getattr(school, 'location', ''),
    }


def render_exam_pdf(draft):
    from .pdf_utils import render_html_to_pdf

    html = render_to_string(
        'ai_features/exam_export.html',
        {
            'draft': draft,
            'school': _school_context(draft.school),
            'questions': draft.questions.all(),
            'generated_at': timezone.now(),
        },
    )
    pdf = render_html_to_pdf(html, base_url=getattr(settings, 'WEASYPRINT_BASEURL', None))
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{draft.title[:60]}-exam.pdf"'
    return response


def render_exam_docx(draft):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    document = Document()
    document.core_properties.title = draft.title
    document.core_properties.author = draft.school.name
    document.core_properties.subject = draft.subject.name if draft.subject else 'Examination'

    title = document.add_heading(draft.school.name, level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if draft.school.motto:
        motto = document.add_paragraph(draft.school.motto)
        motto.alignment = WD_ALIGN_PARAGRAPH.CENTER

    document.add_heading(draft.title, level=1)
    document.add_paragraph(f'Subject: {draft.subject.name if draft.subject else "N/A"}')
    document.add_paragraph(f'Class: {draft.school_class.name if draft.school_class else "N/A"}')
    document.add_paragraph(f'Duration: {draft.duration_minutes} minutes')
    if draft.instructions:
        document.add_heading('Instructions', level=2)
        document.add_paragraph(draft.instructions)

    document.add_heading('Questions', level=2)
    for question in draft.questions.all():
        document.add_paragraph(f'{question.order}. {question.text} ({question.marks} marks)')
        if question.kind == 'MCQ':
            for label, option in zip(['A', 'B', 'C', 'D'], question.options):
                document.add_paragraph(f'{label}. {option}', style='List Bullet')
        else:
            document.add_paragraph('Answer:')
            document.add_paragraph('\n' * 4)

    document.add_page_break()
    document.add_heading('Answer Key', level=1)
    for question in draft.questions.all():
        document.add_paragraph(f'{question.order}. {question.text}')
        if question.kind == 'MCQ':
            label = ['A', 'B', 'C', 'D'][question.correct_option] if question.correct_option < 4 else 'N/A'
            answer = question.options[question.correct_option] if question.correct_option < len(question.options) else ''
            document.add_paragraph(f'Correct Answer: {label}. {answer}')
            if question.explanation:
                document.add_paragraph(f'Explanation: {question.explanation}')
        else:
            document.add_paragraph(f'Expected Answer: {question.expected_answer}')
            document.add_paragraph(f'Marking Guide: {question.marking_guide}')

    buffer = BytesIO()
    document.save(buffer)
    buffer.seek(0)
    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    response['Content-Disposition'] = f'attachment; filename="{draft.title[:60]}-exam.docx"'
    return response
