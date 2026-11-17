"""Where everything sits on a printable mark sheet (A4 portrait, millimetres).

The PDF is drawn from this layout and the photo reader cuts the boxes out of a straightened photo using the very
same numbers, so the two can never drift apart. Coordinates are measured from the top-left corner of the page.

A sheet has four black registration squares in the corners (so a crooked phone photo can be straightened), a QR code
(which sheet and which page), one numbered row per student, and in each row one wide box per mark column (for example CA and Exam) plus a small ABS box.
"""

from __future__ import annotations

PAGE_W, PAGE_H = 210.0, 297.0

# Registration squares: their CENTRES define the straightened picture.
MARKER = 7.0
MARKER_CENTRES = {
    'tl': (13.5, 13.5), 'tr': (196.5, 13.5), 'br': (196.5, 283.5), 'bl': (13.5, 283.5),
}
FRAME_W = MARKER_CENTRES['tr'][0] - MARKER_CENTRES['tl'][0]     # 183 mm
FRAME_H = MARKER_CENTRES['bl'][1] - MARKER_CENTRES['tl'][1]     # 270 mm

# The QR code sits just under the top-right marker (the reader uses it to know which way up the sheet is).
QR_BOX = (160.0, 22.0, 30.0)  # x, y, size

ROWS_TOP = 84.0
ROW_PITCH = 11.4
BOX_H = 9.6
ROWS_PER_PAGE = 16

NUMBER_X = 16.0
NAME_X = 25.0
MARKS_RIGHT = 176.0     # the mark boxes end here, the ABS box follows
COLUMN_GAP = 3.0
ABS_GAP = 5.0
ABS_W = 9.0


def column_width(columns: int) -> float:
    """Width of one mark box: two columns (CA and Exam) share the space, a single column gets a wider box."""
    return 34.0 if columns >= 2 else 46.0


def box_rects(columns: int, row: int):
    """Rectangles (x, y, w, h in mm) of the mark box of every column of one row, then the ABS box (last)."""
    y = ROWS_TOP + row * ROW_PITCH
    w = column_width(columns)
    x = MARKS_RIGHT - columns * w - (columns - 1) * COLUMN_GAP
    rects = []
    for _ in range(columns):
        rects.append((x, y, w, BOX_H))
        x += w + COLUMN_GAP
    rects.append((MARKS_RIGHT + ABS_GAP, y, ABS_W, BOX_H))
    return rects


def row_y(row: int) -> float:
    return ROWS_TOP + row * ROW_PITCH


def pages_needed(rows: int) -> int:
    return max(1, -(-rows // ROWS_PER_PAGE))
