from io import BytesIO

from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone

from .service_utils import student_display_name


def render_guidance_pdf(report):
    from .pdf_utils import render_html_to_pdf

    html = render_to_string(
        'ai_features/guidance_report.html',
        {
            'report': report,
            'student_name': student_display_name(report.student),
            'school': report.student.school,
            'data': report.report_data,
            'generated_at': timezone.now(),
        },
    )
    pdf = render_html_to_pdf(html, base_url=getattr(settings, 'WEASYPRINT_BASEURL', None))
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{student_display_name(report.student)[:50]}-guidance-report.pdf"'
    return response


def render_guidance_docx(report):
    from docx import Document

    data = report.report_data or {}
    document = Document()
    document.core_properties.title = 'Student Guidance Report'
    document.core_properties.author = report.student.school.name
    document.core_properties.subject = student_display_name(report.student)

    document.add_heading(report.student.school.name, level=0)
    document.add_heading('Student Guidance Report', level=1)
    document.add_paragraph(f'Student: {student_display_name(report.student)}')
    document.add_paragraph(f'Academic Year: {report.academic_year}')
    document.add_paragraph(f'Term: {report.term}')
    document.add_paragraph(f'Audience: {report.get_audience_display()}')

    sections = [
        ('Academic Strengths', data.get('academic_strengths', [])),
        ('Academic Weaknesses', data.get('academic_weaknesses', [])),
        ('Career Direction Suggestions', data.get('career_direction_suggestions', [])),
        ('Subject Recommendations', data.get('subject_recommendations', [])),
        ('Study Recommendations', data.get('study_recommendations', [])),
        ('Future Academic Plan', data.get('future_academic_plan', [])),
    ]
    document.add_heading('Attendance Summary', level=1)
    document.add_paragraph(str(data.get('attendance_summary', '')))
    document.add_heading('Behavioural Notes', level=1)
    document.add_paragraph(str(data.get('behavioural_notes', '')))

    for title, values in sections:
        document.add_heading(title, level=1)
        for value in values:
            document.add_paragraph(str(value), style='List Bullet')

    buffer = BytesIO()
    document.save(buffer)
    buffer.seek(0)
    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    response['Content-Disposition'] = f'attachment; filename="{student_display_name(report.student)[:50]}-guidance-report.docx"'
    return response
