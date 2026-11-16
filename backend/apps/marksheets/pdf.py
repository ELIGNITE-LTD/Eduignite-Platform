"""Draws the printable mark sheet with reportlab (A4 portrait)."""

from __future__ import annotations

import io

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from . import layout as L

NAVY = (0.09, 0.23, 0.36)
GREY = (0.45, 0.5, 0.55)


def qr_image(text: str) -> ImageReader:
    code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    code.add_data(text)
    code.make(fit=True)
    buffer = io.BytesIO()
    code.make_image(fill_color='black', back_color='white').save(buffer, format='PNG')
    buffer.seek(0)
    return ImageReader(buffer)


def sheet_code(sheet_id, page: int) -> str:
    return f'EDUSHEET:{sheet_id}:{page}'


def _y(mm_from_top: float) -> float:
    """PDF y (from the bottom) for a position measured from the top of the page."""
    return (L.PAGE_H - mm_from_top) * mm


def build_pdf(sheet) -> bytes:
    """One page per 16 students; every page carries its own QR code."""
    spec = L.Spec(sheet.int_digits, sheet.decimals)
    rows = sheet.rows
    pages = L.pages_needed(len(rows))
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(sheet.title)
    for page in range(1, pages + 1):
        _draw_page(pdf, sheet, spec, rows[(page - 1) * L.ROWS_PER_PAGE: page * L.ROWS_PER_PAGE], page, pages)
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def _draw_page(pdf, sheet, spec, rows, page, pages):
    # Registration squares.
    pdf.setFillColorRGB(0, 0, 0)
    for cx, cy in L.MARKER_CENTRES.values():
        pdf.rect((cx - L.MARKER / 2) * mm, _y(cy + L.MARKER / 2), L.MARKER * mm, L.MARKER * mm, stroke=0, fill=1)

    # Header.
    pdf.setFillColorRGB(*NAVY)
    pdf.setFont('Helvetica-Bold', 15)
    pdf.drawString(22 * mm, _y(27), (sheet.school_name or 'EduIgnite')[:52])
    pdf.setFont('Helvetica-Bold', 12)
    pdf.drawString(22 * mm, _y(35), sheet.title[:60])
    pdf.setFont('Helvetica', 9.5)
    pdf.setFillColorRGB(0.2, 0.2, 0.2)
    y = 42
    for line in sheet.subtitle_lines[:4]:
        pdf.drawString(22 * mm, _y(y), line[:70])
        y += 5
    pdf.setFont('Helvetica-Bold', 8.5)
    pdf.setFillColorRGB(*NAVY)
    pdf.drawString(22 * mm, _y(66), f'Marks out of {sheet.max_label}. Page {page} of {pages}.')
    pdf.setFont('Helvetica', 8)
    pdf.setFillColorRGB(0.25, 0.25, 0.25)
    pdf.drawString(22 * mm, _y(70.5), 'Write ONE digit in each box, in dark ink, like this: 1 4 . 5   (leave unused boxes empty).')
    pdf.drawString(22 * mm, _y(74.5), 'Absent pupil: fill the ABS box. Do not write outside the boxes. Photograph the whole page, flat and well lit.')

    # QR code.
    qx, qy, qs = L.QR_BOX
    pdf.drawImage(qr_image(sheet_code(sheet.id, page)), qx * mm, _y(qy + qs), qs * mm, qs * mm)

    # Column headings.
    pdf.setFont('Helvetica-Bold', 7)
    pdf.setFillColorRGB(*GREY)
    pdf.drawString(L.NUMBER_X * mm, _y(L.ROWS_TOP - 3), 'No')
    pdf.drawString(L.NAME_X * mm, _y(L.ROWS_TOP - 3), 'Student')
    first = L.box_rects(spec, 0)
    labels = (['Hundreds', 'Tens', 'Units'][-spec.int_digits:] if spec.int_digits > 1 else ['Mark']) + (['.1', '.01'][:spec.decimals])
    for (x, _y0, w, _h), label in zip(first[:-1], labels):
        pdf.drawCentredString((x + w / 2) * mm, _y(L.ROWS_TOP - 3), label)
    ax, _ay, aw, _ah = first[-1]
    pdf.drawCentredString((ax + aw / 2) * mm, _y(L.ROWS_TOP - 3), 'ABS')

    # Rows.
    for i, row in enumerate(rows):
        ry = L.row_y(i)
        pdf.setFillColorRGB(0.1, 0.1, 0.1)
        pdf.setFont('Helvetica-Bold', 9)
        pdf.drawString(L.NUMBER_X * mm, _y(ry + L.BOX * 0.68), str((page - 1) * L.ROWS_PER_PAGE + i + 1))
        pdf.setFont('Helvetica-Bold', 9.5)
        pdf.drawString(L.NAME_X * mm, _y(ry + L.BOX * 0.72), (row['name'] or '')[:34])
        pdf.setFont('Helvetica', 7)
        pdf.setFillColorRGB(*GREY)
        pdf.drawString(L.NAME_X * mm, _y(ry + L.BOX * 0.72 + 3.3), (row.get('matricule') or '')[:30])
        rects = L.box_rects(spec, i)
        pdf.setStrokeColorRGB(0.1, 0.1, 0.1)
        pdf.setLineWidth(0.7)
        for x, y0, w, h in rects:
            pdf.rect(x * mm, _y(y0 + h), w * mm, h * mm, stroke=1, fill=0)
        if spec.decimals:
            px = rects[spec.int_digits - 1][0] + L.BOX + (L.BOX_GAP + L.POINT_W) / 2
            pdf.setFillColorRGB(0, 0, 0)
            pdf.circle(px * mm, _y(ry + L.BOX - 1.2), 0.55 * mm, stroke=0, fill=1)

    pdf.setFont('Helvetica', 7)
    pdf.setFillColorRGB(*GREY)
    pdf.drawString(22 * mm, _y(289), f'EduIgnite mark sheet {str(sheet.id)[:8]} - the system reads this page from a photo. Please do not fold the corners.')
