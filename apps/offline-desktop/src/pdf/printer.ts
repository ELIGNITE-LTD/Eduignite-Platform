import fs from 'node:fs';
import path from 'node:path';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// Shared pdfmake server-side printer (Report Cards + Financial receipts).
//
// pdfmake's Node entry point (`require('pdfmake')`) is the server-side
// PdfPrinter class (distinct from the browser bundle used by web apps), and
// it renders through pdfkit under the hood. Rather than shipping custom TTF
// font files (extra bytes in the installer, extra licensing to track), we
// point every font role at pdfkit's built-in standard-14 PDF fonts —
// Helvetica renders correctly on every PDF viewer with zero embedded fonts.
const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

/**
 * Renders a pdfmake document definition to a PDF file on disk, resolving
 * with the file path once fully flushed. Creates the destination directory
 * if it does not already exist.
 */
export function renderPdfToFile(docDefinition: TDocumentDefinitions, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const printer = new PdfPrinter(FONTS);
      const pdfDoc = printer.createPdfKitDocument({
        defaultStyle: { font: 'Helvetica', fontSize: 10 },
        ...docDefinition,
      });
      const stream = fs.createWriteStream(filePath);
      pdfDoc.pipe(stream);
      pdfDoc.end();
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
