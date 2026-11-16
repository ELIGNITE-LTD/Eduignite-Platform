"""Turns a spreadsheet (pasted text, CSV or Excel) into marks matched to a sheet's students.

Teachers often already keep marks in Excel. The columns are found by their headings when there are headings
(matricule or ID, name, mark/score/note), otherwise the first column identifies the student and the next number is
the mark. Students are matched by matricule first, then by name. Nothing is guessed silently: a line that matches
nobody is reported, and an odd value is marked for the teacher to check.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from decimal import Decimal, InvalidOperation

ABSENT_WORDS = {'abs', 'abs.', 'absent', 'absente', 'a'}
MARK_HEADS = ('mark', 'score', 'note', 'grade', 'result', 'ca', 'exam', 'examen', 'total')
ID_HEADS = ('matric', 'id', 'admission', 'no', 'number', 'numero')
NAME_HEADS = ('name', 'nom', 'student', 'etudiant', 'eleve', 'pupil')


def _norm(text) -> str:
    text = unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', text.lower())).strip()


def _tokens(text) -> frozenset:
    return frozenset(_norm(text).split())


def parse_table(raw: bytes | str, filename: str = '') -> list[list[str]]:
    """Rows of cells from pasted text, a CSV file or an .xlsx file."""
    if isinstance(raw, bytes) and (filename.lower().endswith(('.xlsx', '.xlsm')) or raw[:2] == b'PK'):
        from openpyxl import load_workbook

        sheet = load_workbook(io.BytesIO(raw), read_only=True, data_only=True).active
        return [['' if c is None else str(c).strip() for c in row] for row in sheet.iter_rows(values_only=True) if any(c is not None and str(c).strip() for c in row)]
    text = raw.decode('utf-8-sig', errors='replace') if isinstance(raw, bytes) else raw
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    sample = '\n'.join(text.split('\n')[:5])
    delimiter = '\t' if '\t' in sample else (';' if sample.count(';') > sample.count(',') else ',')
    return [[c.strip() for c in row] for row in csv.reader(io.StringIO(text), delimiter=delimiter) if any(c.strip() for c in row)]


def _number(cell):
    cell = str(cell or '').strip().replace(' ', '').replace(',', '.')
    if re.fullmatch(r'-?\d+(\.\d+)?', cell):
        return Decimal(cell)
    return None


def _find_columns(rows):
    """(id column, name column, mark column, first data row)."""
    head = [_norm(c) for c in rows[0]]
    is_header = not any(_number(c) is not None for c in rows[0]) and any(head)
    if is_header:
        def find(words):
            for i, h in enumerate(head):
                if any(h == w or h.startswith(w) or w in h.split() for w in words):
                    return i
            return None
        mark = find(MARK_HEADS)
        ident = find(ID_HEADS)
        name = find(NAME_HEADS)
        if mark is not None and (ident is not None or name is not None):
            return ident, name, mark, 1
    # No usable headings: first column identifies the student, the last column with a number is the mark.
    width = max(len(r) for r in rows)
    mark = None
    for i in range(width - 1, 0, -1):
        if any(_number(r[i] if i < len(r) else '') is not None for r in rows[1:] or rows):
            mark = i
            break
    return 0, (1 if width > 2 else None), mark if mark is not None else (1 if width > 1 else None), 1 if is_header else 0


def match_rows(table: list[list[str]], sheet) -> dict:
    """Readings for every student of ``sheet`` plus the lines that matched nobody."""
    if not table:
        return {'rows': _blank_rows(sheet), 'unmatched': [], 'matched': 0}
    ident, name, mark, start = _find_columns(table)
    by_matricule = {_norm(r.get('matricule')): i for i, r in enumerate(sheet.rows) if r.get('matricule')}
    by_name = {}
    for i, r in enumerate(sheet.rows):
        by_name.setdefault(_tokens(r['name']), []).append(i)
    maximum = Decimal(str(sheet.max_score))
    rows = _blank_rows(sheet)
    unmatched, matched = [], 0
    for line in table[start:]:
        def cell(index):
            return line[index] if index is not None and index < len(line) else ''
        target = None
        if ident is not None and _norm(cell(ident)) in by_matricule:
            target = by_matricule[_norm(cell(ident))]
        if target is None:
            for candidate in (cell(name), cell(ident)):
                hit = by_name.get(_tokens(candidate)) if candidate else None
                if hit and len(hit) == 1:
                    target = hit[0]
                    break
        raw = cell(mark).strip()
        if target is None:
            if raw or cell(ident) or cell(name):
                unmatched.append({'line': ' | '.join(c for c in line if c)[:120], 'value': raw})
            continue
        if raw == '':
            continue
        row = rows[target]
        matched += 1
        if _norm(raw) in ABSENT_WORDS:
            row.update(status='absent', value=None)
            continue
        value = _number(raw)
        if value is None:
            row.update(status='uncertain', value=None, reason='not_a_number', text=raw[:20])
        elif value < 0 or value > maximum:
            row.update(status='uncertain', value=format(value.normalize(), 'f'), reason='above_max' if value > 0 else 'negative')
        else:
            row.update(status='ok', value=format(value.normalize(), 'f'))
    return {'rows': rows, 'unmatched': unmatched[:30], 'matched': matched}


def _blank_rows(sheet):
    return [{'row': i, 'student_id': r['student_id'], 'name': r['name'], 'matricule': r.get('matricule', ''),
             'status': 'blank', 'value': None, 'reason': '', 'confidence': None, 'digits': []} for i, r in enumerate(sheet.rows)]
