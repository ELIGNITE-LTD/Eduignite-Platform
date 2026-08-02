/**
 * Student ID cards as a print-ready PDF.
 *
 * Printing the preview through the browser put every selected card on one A4
 * sheet at screen size, which is why a batch came out many-to-a-page and lost
 * its proportions. This builds the file instead:
 *
 * - every page is exactly one CR80 card, 85.6 x 53.98 mm — the ID-1 / business
 *   card size these are cut to;
 * - each side gets its own page, so a batch reads front, back, front, back and
 *   can be duplexed straight onto card stock;
 * - the card is captured from the live DOM, so the printed card is the design
 *   on screen rather than a re-drawn approximation.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/** ID-1 (CR80) — the standard bank/business card size, in millimetres. */
export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 53.98;

/** Capture scale. 4x over a 450px-wide card lands around 500 dpi at final size. */
const CAPTURE_SCALE = 4;

function cardSides(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-idcard-side]"));
}

/**
 * html2canvas paints a static snapshot, so anything not ready at that instant
 * is captured wrong. Two things clipped the school header:
 *
 * - the web font. Captured before Inter loads, the header falls back to a wider
 *   face, and the school name's `truncate` ellipsis then kicks in early — the
 *   name comes out cut off even though it fits on screen.
 * - the logo. A remote or still-decoding <img> is captured blank.
 *
 * Waiting for both before the capture makes the PDF match the site.
 */
async function waitForCardAssets(root: HTMLElement): Promise<void> {
  try {
    const fonts = (document as any).fonts;
    if (fonts?.ready) await fonts.ready;
  } catch {
    /* fonts API missing — the system font still renders */
  }

  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        // Resolve on error too: a broken logo must not stall the whole export.
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        // Safety net in case neither event fires.
        setTimeout(done, 4000);
      });
    }),
  );

  // One more frame so the browser has painted the now-loaded assets.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * One page per card side, at exact CR80 size.
 *
 * The orientation must be landscape: a card is wider than it is tall, and
 * jsPDF normalises an explicit [w, h] format to match the orientation it is
 * given. Asking for portrait yields a 53.98 x 85.6 page and the card prints
 * on its side.
 */
export async function buildIdCardsPdf(root: HTMLElement): Promise<jsPDF> {
  const sides = cardSides(root);
  if (sides.length === 0) {
    throw new Error("There are no ID cards to export.");
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [CR80_WIDTH_MM, CR80_HEIGHT_MM],
  });

  // Fonts and logos must be ready before any side is captured.
  await waitForCardAssets(root);

  for (let index = 0; index < sides.length; index += 1) {
    const side = sides[index];
    const canvas = await html2canvas(side, {
      scale: CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      imageTimeout: 15000,
      // Capture the card at its own box, so nothing outside it bleeds in and
      // the header is never measured against a different width than on screen.
      width: side.offsetWidth,
      height: side.offsetHeight,
      windowWidth: side.offsetWidth,
      windowHeight: side.offsetHeight,
    });

    if (index > 0) {
      doc.addPage([CR80_WIDTH_MM, CR80_HEIGHT_MM], "landscape");
    }
    // Full bleed: the card art already carries its own margins.
    doc.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      0,
      0,
      CR80_WIDTH_MM,
      CR80_HEIGHT_MM,
    );
  }

  return doc;
}

export async function downloadIdCardsPdf(root: HTMLElement, fileName: string) {
  const doc = await buildIdCardsPdf(root);
  const safe = fileName.replace(/[^a-z0-9_.-]+/gi, "_");
  doc.save(safe.endsWith(".pdf") ? safe : `${safe}.pdf`);
}

export async function printIdCardsPdf(root: HTMLElement) {
  const doc = await buildIdCardsPdf(root);
  doc.autoPrint();
  window.open(doc.output("bloburl") as unknown as string, "_blank");
}
