from io import BytesIO

from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone

from .service_utils import student_display_name


def _student_name(report):
    return student_display_name(report.student) if report.student_id else report.user.get_full_name()


def render_career_pdf(report):
    from .pdf_utils import render_html_to_pdf

    html = render_to_string(
        'ai_features/career_report.html',
        {
            'report': report,
            'student_name': _student_name(report),
            'data': report.report_data,
            'generated_at': timezone.now(),
        },
    )
    pdf = render_html_to_pdf(html, base_url=getattr(settings, 'WEASYPRINT_BASEURL', None))
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{report.desired_career[:60]}-career-report.pdf"'
    return response


def render_career_docx(report):
    from docx import Document

    data = report.report_data or {}
    document = Document()
    document.core_properties.title = 'Career Orientation Report'
    document.core_properties.author = 'EduIgnite'
    document.core_properties.subject = report.desired_career

    document.add_heading('Career Orientation Report', level=0)
    document.add_paragraph(f'Student: {_student_name(report)}')
    document.add_paragraph(f'Desired Career: {report.desired_career}')

    sections = [
        ('Career Overview', data.get('career_overview')),
        ('Secondary Preparation', data.get('secondary_preparation')),
        ('Degree Duration', data.get('degree_duration')),
        ('Future Recommendations', data.get('future_recommendations')),
    ]
    for title, content in sections:
        if content:
            document.add_heading(title, level=1)
            document.add_paragraph(str(content))

    for title, values in [
        ('Subjects to Focus On', data.get('subjects_to_focus', [])),
        ('Exam Requirements', data.get('exam_requirements', [])),
        ('Career Opportunities', data.get('career_opportunities', [])),
        ('Important Skills', data.get('important_skills', [])),
    ]:
        document.add_heading(title, level=1)
        for value in values:
            document.add_paragraph(str(value), style='List Bullet')

    universities = data.get('recommended_universities', [])
    if universities:
        document.add_heading('Recommended Universities', level=1)
        table = document.add_table(rows=1, cols=5)
        headers = ['Name', 'Country', 'Program', 'Duration', 'Website']
        for idx, header in enumerate(headers):
            table.rows[0].cells[idx].text = header
        for uni in universities:
            row = table.add_row().cells
            row[0].text = str(uni.get('name', ''))
            row[1].text = str(uni.get('country', ''))
            row[2].text = str(uni.get('program', ''))
            row[3].text = str(uni.get('duration_years', ''))
            row[4].text = str(uni.get('website', ''))

    if data.get('step_by_step_roadmap'):
        document.add_heading('Step-by-Step Roadmap', level=1)
        for item in data['step_by_step_roadmap']:
            document.add_paragraph(
                f"{item.get('step', '')}. {item.get('title', '')} - {item.get('timeline', '')}"
            )
            document.add_paragraph(str(item.get('description', '')))

    document.add_paragraph('Verify all university information directly with institutions.')
    buffer = BytesIO()
    document.save(buffer)
    buffer.seek(0)
    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    response['Content-Disposition'] = f'attachment; filename="{report.desired_career[:60]}-career-report.docx"'
    return response
