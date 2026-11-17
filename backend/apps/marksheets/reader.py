"""Reads a photographed mark sheet.

Steps: find the QR code (which sheet and page) and the four black corner squares, straighten the photo so every box
is where the layout says it is, cut out each box, decide empty or written, and read each written digit. Nothing is
assumed to be right: every digit carries a confidence and anything doubtful is handed back to the teacher to check.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from decimal import Decimal

import cv2
import numpy as np

from . import digits, layout as L
from .pdf import sheet_code

SCALE = 6.0                      # pixels per millimetre in the straightened picture
CANVAS_W, CANVAS_H = int(L.FRAME_W * SCALE), int(L.FRAME_H * SCALE)
INSET_MM = 1.3                   # ignore the printed border of each box
INK_BLANK = 0.004                # less ink than this (share of the box) = empty
MIN_SPECK = 7                    # a piece of ink smaller than this many pixels is dust, not writing
ABS_INK = 0.05                   # this much ink in the ABS box = the teacher marked absent
SURE = 0.90                      # a digit read with less confidence than this is shown to the teacher
QR_RE = re.compile(r'^EDUSHEET:([0-9a-fA-F-]{36}):(\d+)$')


class SheetReadError(Exception):
    """The photo cannot be used; the message says what to do (plain words)."""


@dataclass
class Page:
    sheet_id: str
    number: int
    canvas: np.ndarray           # straightened grayscale picture of the frame


def _to_gray(image_bytes: bytes) -> np.ndarray:
    data = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise SheetReadError('This file is not a picture. Take a photo of the sheet and upload that.')
    longest = max(img.shape)
    if longest > 2600:
        factor = 2600 / longest
        img = cv2.resize(img, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA)
    return img


def _decode_qr(gray: np.ndarray):
    """(text, centre) of the sheet's QR code, trying a few sizes because phone photos vary a lot."""
    detectors = [cv2.QRCodeDetector()]
    if hasattr(cv2, 'QRCodeDetectorAruco'):
        detectors.insert(0, cv2.QRCodeDetectorAruco())
    for factor in (1.0, 0.6, 1.4, 0.4):
        img = gray if factor == 1.0 else cv2.resize(gray, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA if factor < 1 else cv2.INTER_CUBIC)
        for detector in detectors:
            try:
                text, points, _ = detector.detectAndDecode(img)
            except cv2.error:
                continue
            if text and points is not None:
                centre = points.reshape(-1, 2).mean(axis=0) / factor
                return text, centre
    return None, None


def _find_markers(gray: np.ndarray):
    """Centres of the four corner squares, in the order top-left, top-right, bottom-right, bottom-left of the PHOTO."""
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 71, 12)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape
    area_img = h * w
    found = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if not (0.00025 * area_img < area < 0.02 * area_img):
            continue
        x, y, bw, bh = cv2.boundingRect(contour)
        if not 0.7 < bw / max(bh, 1) < 1.45 or area / (bw * bh) < 0.72:
            continue
        # The corner squares are solid black; the printed boxes are only outlines, so most of their inside is paper.
        if cv2.countNonZero(binary[y:y + bh, x:x + bw]) / float(bw * bh) < 0.7:
            continue
        m = cv2.moments(contour)
        if m['m00'] == 0:
            continue
        found.append((m['m10'] / m['m00'], m['m01'] / m['m00'], area))
    if len(found) < 4:
        raise SheetReadError('The four black corner squares of the sheet are not all visible. Photograph the whole page, flat, with the corners inside the picture.')
    # Squares are the same size: keep the most common size, then take the one nearest each corner of the photo.
    areas = sorted(a for _x, _y, a in found)
    median = areas[len(areas) // 2]
    found = [f for f in found if 0.45 * median < f[2] < 2.2 * median] or found
    pts = np.array([[x, y] for x, y, _a in found], dtype=np.float32)
    corners = [(0, 0), (w, 0), (w, h), (0, h)]
    chosen = []
    for cx, cy in corners:
        distance = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
        chosen.append(pts[int(distance.argmin())])
    if len({tuple(np.round(p)) for p in chosen}) < 4:
        raise SheetReadError('The four black corner squares of the sheet are not all visible. Photograph the whole page, flat, with the corners inside the picture.')
    quad = np.array(chosen, dtype=np.float32)
    if cv2.contourArea(quad) < 0.12 * area_img:
        raise SheetReadError('The sheet looks too small in the photo. Move closer so the page fills the picture.')
    return quad


def straighten(image_bytes: bytes) -> Page:
    gray = _to_gray(image_bytes)
    text, qr_centre = _decode_qr(gray)
    if not text:
        raise SheetReadError('The QR code of the sheet could not be read. Retake the photo with the whole page in focus and good light.')
    match = QR_RE.match(text.strip())
    if not match:
        raise SheetReadError('This is not an EduIgnite mark sheet.')
    quad = _find_markers(gray)
    # The QR code sits under the top-right square: that tells us which way up the page is.
    nearest = int(np.hypot(quad[:, 0] - qr_centre[0], quad[:, 1] - qr_centre[1]).argmin())
    tr = nearest
    ordered = np.array([quad[(tr - 1) % 4], quad[tr], quad[(tr + 1) % 4], quad[(tr + 2) % 4]], dtype=np.float32)  # tl, tr, br, bl
    target = np.array([[0, 0], [CANVAS_W, 0], [CANVAS_W, CANVAS_H], [0, CANVAS_H]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(ordered, target)
    flat = cv2.warpPerspective(gray, matrix, (CANVAS_W, CANVAS_H), flags=cv2.INTER_CUBIC, borderValue=255)
    return Page(sheet_id=match.group(1).lower(), number=int(match.group(2)), canvas=flat)


def _mm_to_px(x_mm: float, y_mm: float):
    tlx, tly = L.MARKER_CENTRES['tl']
    return (x_mm - tlx) * SCALE, (y_mm - tly) * SCALE


def _rect_px(rect, inset_mm=0.0):
    x, y, w, h = rect
    x0, y0 = _mm_to_px(x + inset_mm, y + inset_mm)
    return int(round(x0)), int(round(y0)), int(round((w - 2 * inset_mm) * SCALE)), int(round((h - 2 * inset_mm) * SCALE))


def _binarise(page_gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(page_gray, (3, 3), 0)
    return cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 14)


def _components(cell: np.ndarray):
    """Pieces of ink in one mark box, without what belongs to the printed border and without specks."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(cell, connectivity=8)
    h, w = cell.shape
    pieces = []
    for i in range(1, count):
        x, y, bw, bh, area = (int(v) for v in stats[i])
        touches = x <= 0 or y <= 0 or x + bw >= w or y + bh >= h
        on_side = x <= 1 or x + bw >= w - 1
        on_top_bottom = y <= 1 or y + bh >= h - 1
        # Leftovers of the printed border: a long thin line lying along an edge. A written 1 is also tall and thin
        # but stands away from the left and right edges, so it is kept.
        line_like = (bw >= 0.6 * w and bh <= 0.25 * h and on_top_bottom) or (bh >= 0.85 * h and bw <= 0.25 * h and on_side)
        compact = 0.4 < bw / max(bh, 1) < 2.5 and bh <= 0.3 * h     # a decimal point written on the baseline touches the edge
        if area < MIN_SPECK or (touches and line_like) or (touches and not compact and area < 0.012 * h * w):
            continue
        pieces.append({'x': x, 'y': y, 'w': bw, 'h': bh, 'area': area, 'label': i})
    return labels, pieces


def _split_digits(labels, pieces, height):
    """Group the pieces into written characters, left to right: ('digit', mask) or ('dot', None) or an 'unclear' mark.

    A decimal point is a small piece low in the box. A piece that sits over another one (the bar of a 5, a stroke of
    a 4) belongs to the same digit. Two digits that touch look like one wide piece and are cut apart in the middle.
    """
    dots, big, small = [], [], []
    for p in pieces:
        cy = p['y'] + p['h'] / 2
        if p['h'] <= 0.3 * height and p['w'] <= 0.3 * height and cy >= 0.5 * height:
            dots.append(p)
        elif p['h'] >= 0.36 * height:
            big.append(p)
        else:
            small.append(p)
    groups = []
    for p in sorted(big, key=lambda q: q['x']):
        placed = False
        for g in groups:
            overlap = min(g['x'] + g['w'], p['x'] + p['w']) - max(g['x'], p['x'])
            # Two tall pieces side by side are two digits (slanted 1s overlap a little); only a near-complete overlap
            # means one digit drawn in two strokes.
            both_tall = g['h'] >= 0.6 * height and p['h'] >= 0.6 * height
            if overlap > (0.85 if both_tall else 0.6) * min(g['w'], p['w']):
                x0, y0 = min(g['x'], p['x']), min(g['y'], p['y'])
                x1, y1 = max(g['x'] + g['w'], p['x'] + p['w']), max(g['y'] + g['h'], p['y'] + p['h'])
                g.update(x=x0, y=y0, w=x1 - x0, h=y1 - y0)
                g['labels'].append(p['label'])
                placed = True
                break
        if not placed:
            groups.append({'x': p['x'], 'y': p['y'], 'w': p['w'], 'h': p['h'], 'labels': [p['label']]})
    unclear = 0
    for p in small:        # a fragment of a digit (part of a 5 or 7) joins the digit it sits over, else it is unclear
        for g in groups:
            if min(g['x'] + g['w'], p['x'] + p['w']) - max(g['x'], p['x']) > 0.3 * p['w']:
                g['labels'].append(p['label'])
                g.update(y=min(g['y'], p['y']), h=max(g['y'] + g['h'], p['y'] + p['h']) - min(g['y'], p['y']))
                break
        else:
            unclear += 1
    chars = []
    for g in groups:
        mask = np.isin(labels[g['y']:g['y'] + g['h'], g['x']:g['x'] + g['w']], g['labels']).astype(np.uint8) * 255
        ratio = g['w'] / float(g['h'])
        ink = (mask > 0).sum(axis=0).astype(np.float32)
        pieces_n = 1
        if ratio > 1.2:
            pieces_n = max(2, int(round(g['w'] / (0.62 * g['h']))))
        if pieces_n > 1:
            # Two digits that touch: cut at the thinnest place near each equal division. Without a clear gap (a wide 5
            # or 8 on its own) only a very wide piece is cut.
            cuts, step, clear = [0], g['w'] / pieces_n, True
            for k in range(1, pieces_n):
                lo, hi = int(k * step - step * 0.3), int(k * step + step * 0.3)
                lo, hi = max(lo, cuts[-1] + 1), min(hi, g['w'] - 1)
                if hi <= lo:
                    cuts.append(int(k * step))
                    clear = False
                    continue
                at = lo + int(ink[lo:hi].argmin())
                clear = clear and ink[at] < 0.35 * float(np.median(ink[ink > 0]))
                cuts.append(at)
            cuts.append(g['w'])
            if not clear and ratio < 1.7:
                pieces_n = 1
        if pieces_n == 1:
            chars.append({'kind': 'digit', 'x': g['x'], 'mask': mask, 'split': False, 'wide': ratio > 0.85})
            continue
        for k in range(pieces_n):
            part = mask[:, cuts[k]:cuts[k + 1]]
            if part.any():
                chars.append({'kind': 'digit', 'x': g['x'] + cuts[k], 'mask': part, 'split': True})
    for d in dots:
        centre = d['x'] + d['w'] / 2
        if any(g['x'] <= centre <= g['x'] + g['w'] for g in groups):
            unclear += 1            # a speck under or inside a digit is a stray mark, not a decimal point
            continue
        chars.append({'kind': 'dot', 'x': d['x'], 'mask': None, 'split': False})
    chars.sort(key=lambda c: c['x'])
    return chars, unclear


def _prepare(ink: np.ndarray):
    """MNIST-style 28x28 picture of the written digit (None when nothing is written)."""
    if ink.sum() == 0:
        return None
    ys, xs = np.nonzero(ink)
    crop = ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32) / 255.0
    h, w = crop.shape
    if max(h, w) < 6:
        return None
    factor = 20.0 / max(h, w)
    crop = cv2.resize(crop, (max(1, int(round(w * factor))), max(1, int(round(h * factor)))), interpolation=cv2.INTER_AREA)
    # A pen line is thinner than the training strokes: thicken lightly so both look alike.
    if crop.mean() < 0.17:
        crop = cv2.dilate(crop, np.ones((2, 2), np.uint8))
    canvas = np.zeros((28, 28), np.float32)
    ch, cw = crop.shape
    canvas[(28 - ch) // 2:(28 - ch) // 2 + ch, (28 - cw) // 2:(28 - cw) // 2 + cw] = crop
    cy, cx = np.array(np.nonzero(canvas > 0.1)).mean(axis=1) if (canvas > 0.1).any() else (14, 14)
    shift = (int(round(14 - cy)), int(round(14 - cx)))
    canvas = np.roll(canvas, shift, axis=(0, 1))
    return np.clip(canvas / max(canvas.max(), 1e-3), 0, 1)


def _png_data_url(img: np.ndarray) -> str:
    ok, buf = cv2.imencode('.png', img)
    return 'data:image/png;base64,' + base64.b64encode(buf.tobytes()).decode() if ok else ''


NUMBER_RE = re.compile(r'^\d{1,3}(\.\d{1,2})?$')


def _crop_png(page_gray: np.ndarray, rect) -> str:
    x, y, w, h = _rect_px(rect, -0.8)
    region = page_gray[max(y, 0):max(y, 0) + h, max(x, 0):x + w]
    return _png_data_url(region) if region.size else ''


def read_page(page: Page, sheet) -> dict:
    """Readings of every row of one page, in the order of ``sheet.rows``; each row has one reading per mark column."""
    columns = sheet.column_list
    binary = _binarise(page.canvas)
    first = (page.number - 1) * L.ROWS_PER_PAGE
    people = sheet.rows[first:first + L.ROWS_PER_PAGE]
    images, plan = [], []              # 28x28 pictures to classify, and the row/column/position each belongs to
    layout = []
    for r, person in enumerate(people):
        rects = L.box_rects(len(columns), r)
        ax, ay, aw, ah = _rect_px(rects[-1], 1.4)
        abs_cell = binary[ay:ay + ah, ax:ax + aw]
        row = {'index': first + r, 'person': person, 'absent': bool(abs_cell.size and abs_cell.mean() / 255.0 > ABS_INK), 'cells': []}
        for c, rect in enumerate(rects[:-1]):
            x, y, w, h = _rect_px(rect, INSET_MM)
            cell = binary[y:y + h, x:x + w]
            labels, pieces = _components(cell)
            share = sum(p['area'] for p in pieces) / float(cell.size) if cell.size else 0.0
            if share < INK_BLANK or not pieces:
                row['cells'].append({'chars': None, 'unclear': 0})
                continue
            chars, unclear = _split_digits(labels, pieces, h)
            for ch in chars:
                if ch['kind'] == 'digit':
                    prepared = _prepare(ch['mask'])
                    ch['image'] = len(images) if prepared is not None else None
                    if prepared is not None:
                        images.append(prepared)
            row['cells'].append({'chars': chars, 'unclear': unclear})
        layout.append((row, rects))

    probs = digits.predict(np.stack(images)) if images else np.zeros((0, 10), np.float32)
    rows = []
    for row, rects in layout:
        cells_out, any_uncertain, any_value = [], False, False
        for c, (info, column) in enumerate(zip(row['cells'], columns)):
            maximum = Decimal(str(column['max']))
            out = {'key': column['key'], 'status': 'blank', 'value': None, 'reason': '', 'confidence': None, 'digits': []}
            if info['chars'] is not None:
                text, uncertain, confidences, reason = '', info['unclear'] > 0, [], ''
                for ch in info['chars']:
                    if ch['kind'] == 'dot':
                        text += '.'
                        continue
                    if ch['image'] is None:
                        uncertain = True
                        continue
                    p = probs[ch['image']]
                    order = np.argsort(p)[::-1]
                    best, second = int(order[0]), int(order[1])
                    confidences.append(float(p[best]))
                    if float(p[best]) < SURE or float(p[second]) > 0.35 or ((ch['split'] or ch.get('wide')) and float(p[best]) < 0.99):
                        uncertain = True
                    text += str(best)
                    out['digits'].append({'char': str(best), 'confidence': round(float(p[best]), 3), 'alternative': str(second)})
                text = text.rstrip('.')
                if text.startswith('.'):
                    text = '0' + text
                value = None
                if NUMBER_RE.match(text):
                    value = Decimal(text)
                    if value > maximum:
                        uncertain, reason = True, 'above_max'
                else:
                    uncertain, reason = True, 'unreadable'
                out.update(status='uncertain' if uncertain else 'ok', reason=reason, text=text,
                           value=format(value.normalize(), 'f') if value is not None else None,
                           confidence=round(min(confidences), 3) if confidences else None)
                any_value = True
                if uncertain:
                    any_uncertain = True
                    out['crop'] = _crop_png(page.canvas, rects[c])
            cells_out.append(out)
        status = 'absent' if row['absent'] and not any_value else 'uncertain' if (any_uncertain or (row['absent'] and any_value)) else 'ok' if any_value else 'blank'
        if row['absent'] and any_value:
            for out in cells_out:
                if out['status'] == 'ok':
                    out['status'], out['reason'] = 'uncertain', 'abs_and_mark'
        person = row['person']
        rows.append({'row': row['index'], 'student_id': person['student_id'], 'name': person['name'], 'matricule': person.get('matricule', ''),
                     'status': status, 'absent': row['absent'] and not any_value, 'cells': cells_out})
    return {'page': page.number, 'rows': rows}
