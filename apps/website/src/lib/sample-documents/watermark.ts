/**
 * "SAMPLE" marking for the public /sample-documents page.
 *
 * The existing document generators are used exactly as they are; the mark is
 * added to their output afterwards, so a sample can never be mistaken for a
 * real record, in the on-screen preview or in the downloaded file.
 */

import type { jsPDF } from "jspdf";

export const WATERMARK_LINE_1 = "SAMPLE";
export const WATERMARK_LINE_2 = "FICTIONAL DATA - NOT A REAL RECORD";

/**
 * Overlay placed inside the document's root element (`.rc`, `.cert` or
 * `.transcript`) so it is captured by the PDF export as well as shown in the
 * preview. Returns the HTML unchanged when no root element is found.
 */
export function addHtmlWatermark(html: string): string {
  const overlay =
    `<div aria-hidden="true" style="position:absolute;left:0;top:0;right:0;bottom:0;z-index:50;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center">` +
    `<div style="transform:rotate(-30deg);text-align:center;font-family:Arial,Helvetica,sans-serif;font-weight:900;color:rgba(200,30,30,0.16);line-height:1;white-space:nowrap">` +
    `<div style="font-size:150px;letter-spacing:12px">${WATERMARK_LINE_1}</div>` +
    `<div style="font-size:26px;letter-spacing:3px;margin-top:10px">${WATERMARK_LINE_2}</div>` +
    `</div></div>`;
  const rootTag = /<(div|section)\b[^>]*\bclass="[^"]*\b(?:rc|cert|transcript)\b[^"]*"[^>]*>/;
  if (!rootTag.test(html)) return html;
  const withOverlay = html.replace(rootTag, (tag) => `${tag}${overlay}`);
  // The overlay is positioned against the document sheet, so the sheet must be a containing block.
  return `<style>.rc,.cert,.transcript{position:relative}</style>${withOverlay}`;
}

/** Diagonal mark across every page of a jsPDF document, plus a small tag at the top edge. */
export function addPdfWatermark(doc: jsPDF): jsPDF {
  const pages = doc.getNumberOfPages();
  const anyDoc = doc as any;
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const small = Math.min(w, h) < 120; // ID-card sized pages
    const size = Math.min(w, h) * (small ? 0.3 : 0.26);
    const angle = small ? 55 : 35;
    const rad = (angle * Math.PI) / 180;

    doc.saveGraphicsState();
    try {
      doc.setGState(new anyDoc.GState({ opacity: small ? 0.22 : 0.15 }));
    } catch {
      /* opacity unsupported: the mark is drawn at full strength instead */
    }
    doc.setTextColor(200, 30, 30);
    doc.setFont("helvetica", "bold");

    doc.setFontSize(size);
    const w1 = doc.getTextWidth(WATERMARK_LINE_1);
    const cx = w / 2;
    const cy = h / 2;
    doc.text(WATERMARK_LINE_1, cx - (w1 / 2) * Math.cos(rad), cy + (w1 / 2) * Math.sin(rad), { angle });

    if (!small) {
      doc.setFontSize(size * 0.17);
      const w2 = doc.getTextWidth(WATERMARK_LINE_2);
      // Second line sits just below the first, along the same rotated baseline.
      const drop = size * 0.5;
      const ox = cx + drop * Math.sin(rad);
      const oy = cy + drop * Math.cos(rad);
      doc.text(WATERMARK_LINE_2, ox - (w2 / 2) * Math.cos(rad), oy + (w2 / 2) * Math.sin(rad), { angle });
    }
    doc.restoreGraphicsState();

    if (!small) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(200, 30, 30);
      doc.text(`${WATERMARK_LINE_1} DOCUMENT - ${WATERMARK_LINE_2}`, w / 2, 4.5, { align: "center" });
    }
  }
  doc.setPage(1);
  return doc;
}
