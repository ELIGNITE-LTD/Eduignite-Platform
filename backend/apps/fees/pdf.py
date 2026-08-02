from datetime import datetime


PAGE_WIDTH = 595
PAGE_HEIGHT = 842
LEFT_MARGIN = 48
TOP_Y = 800
LINE_HEIGHT = 14
MAX_LINES_PER_PAGE = 48


def _escape_pdf_text(value):
    return (
        str(value or '')
        .replace('\\', '\\\\')
        .replace('(', '\\(')
        .replace(')', '\\)')
    )


def _build_content_stream(lines):
    text_lines = ['BT', '/F1 10 Tf', f'{LEFT_MARGIN} {TOP_Y} Td', f'{LINE_HEIGHT} TL']
    for line in lines:
        text_lines.append(f'({_escape_pdf_text(line)}) Tj')
        text_lines.append('T*')
    text_lines.append('ET')
    return '\n'.join(text_lines)


def _render_pages(pages):
    objects = []

    def add_object(payload):
        objects.append(payload)
        return len(objects)

    font_id = add_object('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    page_ids = []

    for lines in pages:
        stream = _build_content_stream(lines)
        stream_bytes = stream.encode('latin-1', errors='replace')
        content_id = add_object(
            f'<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream'
        )
        page_ids.append(
            add_object(
                '<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 '
                f'{PAGE_WIDTH} {PAGE_HEIGHT}] /Resources << /Font << /F1 {font_id} 0 R >> >> '
                f'/Contents {content_id} 0 R >>'
            )
        )

    pages_id = add_object(
        '<< /Type /Pages /Kids ['
        + ' '.join(f'{page_id} 0 R' for page_id in page_ids)
        + f'] /Count {len(page_ids)} >>'
    )
    catalog_id = add_object(f'<< /Type /Catalog /Pages {pages_id} 0 R >>')

    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for object_id, payload in enumerate(objects, start=1):
        if '{pages}' in payload:
            payload = payload.format(pages=pages_id)
        offsets.append(len(pdf))
        pdf.extend(f'{object_id} 0 obj\n'.encode('latin-1'))
        pdf.extend(payload.encode('latin-1', errors='replace'))
        pdf.extend(b'\nendobj\n')

    xref_start = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode('latin-1'))
    pdf.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        pdf.extend(f'{offset:010d} 00000 n \n'.encode('latin-1'))
    pdf.extend(
        (
            f'trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n'
            f'startxref\n{xref_start}\n%%EOF'
        ).encode('latin-1')
    )
    return bytes(pdf)


def build_school_fee_report_pdf(*, school_name, summary_lines, class_lines, record_lines, generated_at=None):
    generated_label = generated_at or datetime.now().strftime('%Y-%m-%d %H:%M')
    all_lines = [
        f'School Fees Report - {school_name}',
        f'Generated at: {generated_label}',
        '',
        'School Summary',
        *summary_lines,
        '',
        'Class Breakdown',
        *class_lines,
        '',
        'Student Registry',
        *record_lines,
    ]

    if not record_lines:
        all_lines.append('No student fee records matched the current filters.')

    pages = []
    current_page = []
    for line in all_lines:
        current_page.append(line[:140])
        if len(current_page) >= MAX_LINES_PER_PAGE:
            pages.append(current_page)
            current_page = []
    if current_page:
        pages.append(current_page)

    return _render_pages(pages or [['School Fees Report', 'No data available.']])
