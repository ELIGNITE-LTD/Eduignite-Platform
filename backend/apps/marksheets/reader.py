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
INSET_MM = 1.0                   # ignore the printed border of each box
INK_BLANK = 0.012                # less ink than this (share of the box) = empty
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


def _clean_ink(cell: np.ndarray) -> np.ndarray:
    """Remove what is not handwriting: specks, and anything that is a leftover of the printed box border."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(cell, connectivity=8)
    keep = np.zeros_like(cell)
    h, w = cell.shape
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        touches = x <= 0 or y <= 0 or x + bw >= w or y + bh >= h
        line_like = (bw >= 0.85 * w and bh <= 0.25 * h) or (bh >= 0.85 * h and bw <= 0.25 * w)
        if area < 0.0035 * h * w or (touches and line_like) or (touches and area < 0.03 * h * w):
            continue
        keep[labels == i] = 255
    return keep


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


def read_page(page: Page, sheet) -> dict:
    """Readings of every row of one page, in the order of ``sheet.rows``."""
    spec = L.Spec(sheet.int_digits, sheet.decimals)
    binary = _binarise(page.canvas)
    first = (page.number - 1) * L.ROWS_PER_PAGE
    people = sheet.rows[first:first + L.ROWS_PER_PAGE]
    cells, locations = [], []          # 28x28 pictures to classify, and where each came from
    row_info = []
    for r, person in enumerate(people):
        rects = L.box_rects(spec, r)
        digit_rects, abs_rect = rects[:-1], rects[-1]
        info = {'index': first + r, 'person': person, 'boxes': [], 'abs': False}
        ax, ay, aw, ah = _rect_px(abs_rect, 1.4)
        abs_cell = binary[ay:ay + ah, ax:ax + aw]
        info['abs'] = bool(abs_cell.size and abs_cell.mean() / 255.0 > ABS_INK)
        for position, rect in enumerate(digit_rects):
            x, y, w, h = _rect_px(rect, INSET_MM)
            ink = _clean_ink(binary[y:y + h, x:x + w])
            share = float((ink > 0).mean()) if ink.size else 0.0
            if share < INK_BLANK:
                info['boxes'].append(None)
                continue
            prepared = _prepare(ink)
            if prepared is None:
                info['boxes'].append(None)
                continue
            info['boxes'].append(len(cells))
            cells.append(prepared)
            locations.append((r, position))
        row_info.append(info)

    probs = digits.predict(np.stack(cells)) if cells else np.zeros((0, 10), np.float32)
    maximum = Decimal(str(sheet.max_score))
    rows = []
    for info in row_info:
        person = info['person']
        chars, uncertain, confidences, detail = [], False, [], []
        for position, cell_index in enumerate(info['boxes']):
            if cell_index is None:
                chars.append('')
                detail.append(None)
                continue
            p = probs[cell_index]
            order = np.argsort(p)[::-1]
            best, second = int(order[0]), int(order[1])
            confidence = float(p[best])
            confidences.append(confidence)
            if confidence < SURE or float(p[second]) > 0.35:
                uncertain = True
            chars.append(str(best))
            detail.append({'box': position, 'char': str(best), 'confidence': round(confidence, 3), 'alternative': str(second)})
        written = any(c != '' for c in chars)
        value, reason = None, ''
        if written:
            int_part = _assemble(chars[:spec.int_digits])
            dec_part = _assemble(chars[spec.int_digits:], keep_leading=True) if spec.decimals else ''
            text = int_part or '0'
            if dec_part:
                text = f'{text}.{dec_part}'
            try:
                value = Decimal(text)
            except Exception:  # noqa: BLE001
                value, uncertain, reason = None, True, 'unreadable'
            if value is not None and value > maximum:
                uncertain, reason = True, 'above_max'
            if info['abs']:
                uncertain, reason = True, 'abs_and_mark'
        if not written and info['abs']:
            status = 'absent'
        elif not written:
            status = 'blank'
        else:
            status = 'uncertain' if uncertain else 'ok'
        row = {
            'row': info['index'], 'student_id': person['student_id'], 'name': person['name'], 'matricule': person.get('matricule', ''),
            'status': status, 'value': (format(value.normalize(), 'f') if value is not None else None), 'reason': reason,
            'confidence': round(min(confidences), 3) if confidences else None, 'digits': [d for d in detail if d],
        }
        if status == 'uncertain':
            x0, y0, _w0, _h0 = _rect_px(L.box_rects(spec, info['index'] - first)[0], -1.5)
            last = L.box_rects(spec, info['index'] - first)[-2]
            x1, _y1, w1, h1 = _rect_px(last, -1.5)
            crop = page.canvas[max(y0, 0):max(y0, 0) + h1, max(x0, 0):x1 + w1]
            row['crop'] = _png_data_url(crop) if crop.size else ''
        rows.append(row)
    return {'page': page.number, 'rows': rows}


def _assemble(chars, keep_leading=False) -> str:
    """Digits of one part: empty boxes after the first digit count as zero; empty boxes before it are skipped."""
    out, started = '', keep_leading
    for c in chars:
        if c == '':
            if started:
                out += '0'
            continue
        started = True
        out += c
    return out.rstrip('0') if keep_leading else out
