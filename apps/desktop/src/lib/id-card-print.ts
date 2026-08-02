/**
 * Print student ID cards exactly as they appear on the platform.
 *
 * html2canvas re-draws the DOM with its own renderer, so it can never be
 * pixel-identical to the screen. This instead prints the *real* cards through
 * the browser's own engine: it copies the app's stylesheets into a hidden
 * iframe, drops each card side onto its own CR80-sized page, and calls print().
 * "Save as PDF" from that dialog is then byte-for-byte the card on screen.
 *
 * The mobile app has no print dialog inside its WebView, so it keeps the
 * jsPDF/native-save path (see id-card-pdf.ts); this is for web and desktop.
 */

/** ID-1 / CR80 — the standard card size, in millimetres. */
export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 53.98;

/** The card is authored at this pixel size in the component. */
const CARD_WIDTH_PX = 450;
const CARD_HEIGHT_PX = 284;

const MM_TO_PX = 96 / 25.4; // CSS reference pixels per millimetre

function cardSides(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-idcard-side]"));
}

/** Every <style> and stylesheet <link> in the document, so the clone matches. */
function collectStyles(): string {
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join("\n");
}

async function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 4000);
          }),
    ),
  );
}

/**
 * Open the print dialog with each selected card side on its own CR80 page.
 * From the dialog the user picks "Save as PDF" (exact) or a physical printer.
 */
export async function printIdCardsExact(root: HTMLElement): Promise<void> {
  const sides = cardSides(root);
  if (sides.length === 0) {
    throw new Error("There are no ID cards to print.");
  }

  // Match the screen: fonts must be ready before the cards are cloned.
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* fonts API missing — system fonts still render */
  }

  // The whole card scales as one unit, so the design is preserved exactly.
  const scale = (CR80_WIDTH_MM * MM_TO_PX) / CARD_WIDTH_PX;

  const pages = sides
    .map((el) => `<div class="cr80-page"><div class="cr80-holder">${el.outerHTML}</div></div>`)
    .join("");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    throw new Error("Could not prepare the print document.");
  }

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8">${collectStyles()}` +
      `<style>` +
      `@page { size: ${CR80_WIDTH_MM}mm ${CR80_HEIGHT_MM}mm; margin: 0; }` +
      `html,body { margin:0; padding:0; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }` +
      `.cr80-page { width:${CR80_WIDTH_MM}mm; height:${CR80_HEIGHT_MM}mm; overflow:hidden; page-break-after:always; break-after:page; }` +
      `.cr80-page:last-child { page-break-after:auto; break-after:auto; }` +
      `.cr80-holder { width:${CARD_WIDTH_PX}px; height:${CARD_HEIGHT_PX}px; transform:scale(${scale}); transform-origin:top left; }` +
      // On card stock the shadow and screen rounding aren't wanted; the card's
      // own print: classes already drop the shadow, this makes it certain.
      `.cr80-holder [data-idcard-side] { box-shadow:none !important; }` +
      `</style></head><body>${pages}</body></html>`,
  );
  doc.close();

  // Let the clone lay out, its stylesheets apply and its images decode.
  await waitForImages(doc);
  try {
    await (doc as any).fonts?.ready;
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 250));

  win.focus();
  win.print();

  // Remove the iframe once the dialog is done. onafterprint is unreliable
  // across browsers, so fall back to a timeout.
  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* already gone */
    }
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60000);
}
