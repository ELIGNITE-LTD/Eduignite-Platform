"""Where everything sits on a printable mark sheet (A4 portrait, millimetres).

The PDF is drawn from this layout and the photo reader cuts the boxes out of a straightened photo using the very
same numbers, so the two can never drift apart. Coordinates are measured from the top-left corner of the page.

A sheet has four black registration squares in the corners (so a crooked phone photo can be straightened), a QR code
(which sheet and which page), one numbered row per student, and in each row a few digit boxes plus an ABS box.
"""

from __future__ import annotations

from dataclasses import dataclass

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
BOX = 8.6
BOX_GAP = 1.4
ROWS_PER_PAGE = 16

NUMBER_X = 16.0
NAME_X = 25.0
BOXES_X = 112.0
POINT_W = 4.0


@dataclass(frozen=True)
class Spec:
    """What a column of boxes holds."""

    int_digits: int      # boxes before the decimal point (1 to 3)
    decimals: int        # boxes after the decimal point (0 to 2)

    @property
    def boxes(self) -> int:
        return self.int_digits + self.decimals


def box_rects(spec: Spec, row: int):
    """Rectangles (x, y, w, h in mm) of every digit box of one row, then the ABS box (last)."""
    y = ROWS_TOP + row * ROW_PITCH
    rects = []
    x = BOXES_X
    for _ in range(spec.int_digits):
        rects.append((x, y, BOX, BOX))
        x += BOX + BOX_GAP
    if spec.decimals:
        x += POINT_W
        for _ in range(spec.decimals):
            rects.append((x, y, BOX, BOX))
            x += BOX + BOX_GAP
    x += 5.0
    rects.append((x, y, BOX, BOX))   # ABS
    return rects


def row_y(row: int) -> float:
    return ROWS_TOP + row * ROW_PITCH


def pages_needed(rows: int) -> int:
    return max(1, -(-rows // ROWS_PER_PAGE))
