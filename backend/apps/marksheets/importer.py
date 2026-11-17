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


ALIASES = {'ca': ('ca', 'cc', 'continuous', 'controle', 'assessment'), 'exam': ('exam', 'examen', 'sn', 'session'),
           'mark': MARK_HEADS, 'level': ('level', 'niveau', 'rating')}


def _heading_matches(head: str, column) -> bool:
    words = set(head.split())
    names = {column['key'], _norm(column['label'])} | set(ALIASES.get(column['key'], ()))
    return any(n and (head == n or n in words or head.startswith(n)) for n in names)


def _find_columns(rows, columns):
    """(id column, name column, one mark column per sheet column, first data row)."""
    head = [_norm(c) for c in rows[0]]
    is_header = not any(_number(c) is not None for c in rows[0]) and any(head)
    if is_header:
        def find(words):
            for i, h in enumerate(head):
                if any(h == w or h.startswith(w) or w in h.split() for w in words):
                    return i
            return None
        ident, name = find(ID_HEADS), find(NAME_HEADS)
        marks = [next((i for i, h in enumerate(head) if i not in (ident, name) and _heading_matches(h, c)), None) for c in columns]
        if len(columns) == 1 and marks[0] is None:
            marks = [find(MARK_HEADS)]
        if all(m is not None for m in marks) and (ident is not None or name is not None):
            return ident, name, marks, 1
    # No usable headings: first column identifies the student, the numeric columns after it are the marks in order.
    width = max(len(r) for r in rows)
    numeric = [i for i in range(1, width) if any(_number(r[i] if i < len(r) else '') is not None or _norm(r[i] if i < len(r) else '') in ABSENT_WORDS for r in rows[1:] or rows)]
    marks = numeric[-len(columns):] if numeric else []
    marks = [None] * (len(columns) - len(marks)) + marks
    name = 1 if width > 2 and 1 not in marks else None
    return 0, name, marks, 1 if is_header else 0


def match_rows(table: list[list[str]], sheet) -> dict:
    """Readings for every student of ``sheet`` plus the lines that matched nobody."""
    columns = sheet.column_list
    if not table:
        return {'rows': _blank_rows(sheet), 'unmatched': [], 'matched': 0, 'columns': columns}
    ident, name, mark_cols, start = _find_columns(table, columns)
    by_matricule = {_norm(r.get('matricule')): i for i, r in enumerate(sheet.rows) if r.get('matricule')}
    by_name = {}
    for i, r in enumerate(sheet.rows):
        by_name.setdefault(_tokens(r['name']), []).append(i)
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
        raws = [cell(m).strip() for m in mark_cols]
        if target is None:
            if any(raws) or cell(ident) or cell(name):
                unmatched.append({'line': ' | '.join(c for c in line if c)[:120], 'value': ' / '.join(r for r in raws if r)})
            continue
        if not any(raws):
            continue
        row = rows[target]
        matched += 1
        absent_here = any(_norm(r) in ABSENT_WORDS for r in raws if r)
        for out, raw, column in zip(row['cells'], raws, columns):
            if raw == '' or _norm(raw) in ABSENT_WORDS:
                continue
            maximum = Decimal(str(column['max']))
            value = _number(raw)
            if value is None:
                out.update(status='uncertain', reason='not_a_number', text=raw[:20])
            elif value < 0 or value > maximum:
                out.update(status='uncertain', value=format(value.normalize(), 'f'), reason='above_max' if value > 0 else 'negative')
            else:
                out.update(status='ok', value=format(value.normalize(), 'f'))
        statuses = {c['status'] for c in row['cells']}
        row['absent'] = absent_here and statuses == {'blank'}
        row['status'] = 'absent' if row['absent'] else 'uncertain' if 'uncertain' in statuses else 'ok' if 'ok' in statuses else 'blank'
    return {'rows': rows, 'unmatched': unmatched[:30], 'matched': matched, 'columns': columns}


def _blank_rows(sheet):
    return [{'row': i, 'student_id': r['student_id'], 'name': r['name'], 'matricule': r.get('matricule', ''), 'status': 'blank', 'absent': False,
             'cells': [{'key': c['key'], 'status': 'blank', 'value': None, 'reason': '', 'confidence': None, 'digits': []} for c in sheet.column_list]}
            for i, r in enumerate(sheet.rows)]
