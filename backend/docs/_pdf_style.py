"""Shared house style for the EduIgnite PDF documents.

Both generators import from here so the manual and the architecture document
look like one family, and so a change to the palette or the page furniture only
has to be made once.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer, Table, TableStyle,
)

NAVY = colors.HexColor('#12314d')
BLUE = colors.HexColor('#264D73')
CYAN = colors.HexColor('#67D0E4')
GREY = colors.HexColor('#5b6b7c')
LIGHT = colors.HexColor('#F2F6FA')
RULE = colors.HexColor('#dbe4ec')

_sheet = getSampleStyleSheet()


def _style(name, **kw):
    kw.setdefault('parent', _sheet['Normal'])
    return ParagraphStyle(name, **kw)


BODY = _style('Body', fontSize=10, leading=15.5,
              textColor=colors.HexColor('#22303c'), spaceAfter=8)
H1 = _style('H1', fontName='Helvetica-Bold', fontSize=18, leading=22,
            textColor=NAVY, spaceBefore=6, spaceAfter=9)
H2 = _style('H2', fontName='Helvetica-Bold', fontSize=13, leading=16.5,
            textColor=BLUE, spaceBefore=13, spaceAfter=5)
H3 = _style('H3', fontName='Helvetica-Bold', fontSize=10.5, leading=13.5,
            textColor=NAVY, spaceBefore=9, spaceAfter=3)
BULLET = _style('Bullet', parent=BODY, leftIndent=14, spaceAfter=4)
CODE = _style('Code', fontName='Courier', fontSize=7.6, leading=10.4,
              textColor=colors.HexColor('#11304a'), backColor=LIGHT,
              borderPadding=7, leftIndent=2, spaceBefore=5, spaceAfter=9)
NOTE = _style('Note', parent=BODY, fontSize=9.3, leading=13.8, textColor=GREY,
              leftIndent=8, borderPadding=7,
              backColor=colors.HexColor('#FFF8E6'), spaceBefore=4, spaceAfter=9)
CAPTION = _style('Caption', parent=BODY, fontSize=8.5, textColor=GREY, spaceAfter=11)

COVER_BRAND = _style('CoverBrand', fontName='Helvetica-Bold', fontSize=38,
                     leading=42, textColor=NAVY, alignment=TA_CENTER)
COVER_SUB = _style('CoverSub', fontName='Helvetica-Bold', fontSize=11.5,
                   textColor=CYAN, alignment=TA_CENTER)
COVER_TITLE = _style('CoverTitle', fontName='Helvetica-Bold', fontSize=17,
                     leading=22, textColor=BLUE, alignment=TA_CENTER)
COVER_BLURB = _style('CoverBlurb', fontSize=10.5, leading=16, textColor=GREY,
                     alignment=TA_CENTER)
COVER_FOOT = _style('CoverFoot', fontSize=8.5, textColor=GREY, alignment=TA_CENTER)


def para(text, style=BODY):
    return Paragraph(text, style)


def bullets(items, style=BULLET):
    return [Paragraph(f'&bull;&nbsp;&nbsp;{item}', style) for item in items]


def code(text):
    """A code block. Preformatted keeps newlines and indentation as written."""
    return Preformatted(text.strip('\n'), CODE)


def rule(width=165):
    t = Table([['']], colWidths=[width * mm], rowHeights=[1.1])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), CYAN)]))
    return t


def table(rows, widths, head=True, size=8.2):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    cmds = [
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), size),
        ('LEADING', (0, 0), (-1, -1), size + 3.2),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.4, RULE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#F8FAFC')]),
    ]
    if head:
        cmds += [
            ('BACKGROUND', (0, 0), (-1, 0), NAVY),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]
    t.setStyle(TableStyle(cmds))
    return t


def cover(title, subtitle_lines, doc_kind='EduIgnite OS'):
    return [
        Spacer(1, 44 * mm),
        Paragraph('EDUIGNITE', COVER_BRAND),
        Spacer(1, 3 * mm),
        Paragraph('O P E R A T I N G &nbsp; S Y S T E M', COVER_SUB),
        Spacer(1, 10 * mm),
        rule(),
        Spacer(1, 10 * mm),
        Paragraph(title, COVER_TITLE),
        Spacer(1, 6 * mm),
        Paragraph(subtitle_lines, COVER_BLURB),
        Spacer(1, 56 * mm),
        Paragraph('Powered by EduIgnite &nbsp;&middot;&nbsp; Bamenda, Cameroon',
                  COVER_FOOT),
        PageBreak(),
    ]


def make_header_footer(right_label):
    def header_footer(canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setFont('Helvetica-Bold', 7.5)
            canvas.setFillColor(BLUE)
            canvas.drawString(20 * mm, 285 * mm, 'EDUIGNITE OS')
            canvas.setFont('Helvetica', 7.5)
            canvas.setFillColor(GREY)
            canvas.drawRightString(190 * mm, 285 * mm, right_label)
            canvas.setStrokeColor(RULE)
            canvas.setLineWidth(0.5)
            canvas.line(20 * mm, 282 * mm, 190 * mm, 282 * mm)
            canvas.setFont('Helvetica', 8)
            canvas.setFillColor(GREY)
            canvas.drawCentredString(105 * mm, 12 * mm, str(doc.page))
        canvas.restoreState()
    return header_footer


def build(path, story, title, right_label, subject=''):
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=25 * mm, bottomMargin=20 * mm,
        title=title, author='EduIgnite', subject=subject,
    )
    hf = make_header_footer(right_label)
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    return path
