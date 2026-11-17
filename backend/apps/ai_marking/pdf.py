"""The marked script as a PDF: the student's score, each answer with its mark, comment and correction."""

from __future__ import annotations

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor('#1e3a5f')


def _fmt(value) -> str:
    value = float(value)
    return str(int(value)) if value == int(value) else f'{value:.2f}'.rstrip('0').rstrip('.')


def _story_for(script, styles):
    job = script.job
    name = script.student.display_name if script.student_id else (script.detected_name or 'Unidentified student')
    matricule = script.student.display_matricule if script.student_id else script.detected_matricule
    small = ParagraphStyle('small', parent=styles['BodyText'], fontSize=8.5, leading=11)
    head = ParagraphStyle('head', parent=styles['Title'], textColor=NAVY, fontSize=17, leading=21, alignment=0)
    out = [
        Paragraph(escape(job.school.name), ParagraphStyle('s', parent=styles['Normal'], textColor=NAVY, fontSize=10)),
        Paragraph(escape(job.title), head),
        Paragraph(f'<b>{escape(name)}</b>{" · " + escape(matricule) if matricule else ""}', styles['BodyText']),
        Spacer(1, 4 * mm),
        Table([[Paragraph('<b>Score</b>', styles['BodyText']),
                Paragraph(f'<font size="18"><b>{_fmt(script.total)} / {_fmt(job.paper_total)}</b></font>', styles['BodyText'])]],
              colWidths=[30 * mm, 60 * mm], style=[('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#eef3f9')), ('BOX', (0, 0), (-1, -1), 0.5, NAVY),
                                                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]),
        Spacer(1, 5 * mm),
    ]
    rows = [[Paragraph('<b>Q</b>', small), Paragraph('<b>Mark</b>', small), Paragraph('<b>Your answer</b>', small), Paragraph('<b>Comment and correction</b>', small)]]
    for q in script.questions:
        note = escape(q.get('comment') or '')
        if q.get('correction'):
            note += f'<br/><b>Correct answer:</b> {escape(q["correction"])}'
        rows.append([Paragraph(escape(str(q.get('no'))), small), Paragraph(f'{_fmt(q["awarded"])}/{_fmt(q["max"])}', small),
                     Paragraph(escape(q.get('student_answer') or '—'), small), Paragraph(note or '—', small)])
    table = Table(rows, colWidths=[12 * mm, 18 * mm, 65 * mm, 75 * mm], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbe6f2')), ('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
                               ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    out.append(table)
    if script.feedback:
        out += [Spacer(1, 5 * mm), Paragraph('<b>Feedback</b>', styles['BodyText']), Paragraph(escape(script.feedback), styles['BodyText'])]
    out += [Spacer(1, 6 * mm), Paragraph('Marked with the help of AI and reviewed by your teacher. If you think an answer was marked wrongly, '
                                         'raise a question in EduIgnite and your teacher will look at it again.', small)]
    return out


def build_pdf(scripts) -> bytes:
    """One page (or more) per script, in the order given."""
    styles = getSampleStyleSheet()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title='Marked script')
    story = []
    for i, script in enumerate(scripts):
        if i:
            story.append(PageBreak())
        story += _story_for(script, styles)
    doc.build(story)
    return buffer.getvalue()
