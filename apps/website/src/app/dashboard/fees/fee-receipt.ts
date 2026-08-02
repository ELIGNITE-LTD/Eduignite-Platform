// Shared, styled fee/subscription receipt used across the bursar, school-admin,
// student and parent fee views. One design, one download/print path, so a
// receipt looks identical wherever it is produced.
//
// The sheet prints two copies of the same receipt — the school's and the
// student's — separated by a cut line, which is how fee receipts are issued in
// practice: the bursar keeps one half and hands the other to the payer.
//
// The PDF is drawn with jsPDF primitives rather than screenshotting the HTML,
// so the text stays selectable, searchable and crisp at any zoom — the same
// rule the rest of the platform's documents follow.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const CURRENCY = "XAF";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] as string));
}

export function money(value: unknown, currency = CURRENCY): string {
  const amount = Number(value || 0);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

/** Amounts on the printed receipt itself, e.g. "FCFA 65,000". */
function receiptMoney(value: unknown): string {
  return `FCFA ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function methodLabel(method: string | undefined): string {
  switch ((method || "").toLowerCase()) {
    case "mtn_momo": return "MTN Mobile Money";
    case "orange_money": return "Orange Money";
    case "mobile_money": return "Mobile Money";
    case "cash": return "Cash";
    case "bank": return "Bank Transfer";
    default: return method || "Mobile Money";
  }
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)] + (rest ? ` ${ONES[rest]}` : "");
  }
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${underThousand(rest)}` : ""}`;
}

/** "Sixty Five Thousand Francs CFA Only" — the words line on a fee receipt. */
export function amountToWords(value: unknown): string {
  const total = Math.floor(Math.abs(Number(value || 0)));
  if (!total) return "Zero Francs CFA Only";

  const scales: [number, string][] = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];
  let remaining = total;
  const parts: string[] = [];
  for (const [size, name] of scales) {
    const count = Math.floor(remaining / size);
    if (count) {
      parts.push(`${underThousand(count)} ${name}`);
      remaining -= count * size;
    }
  }
  if (remaining) parts.push(underThousand(remaining));
  return `${parts.join(" ")} Francs CFA Only`;
}

/** One line on the receipt's fee table. */
export type ReceiptItem = { label: string; amount: number };

export type ReceiptData = {
  receiptNo: string;
  reference?: string;
  studentName?: string;
  matricule?: string;
  studentClass?: string;
  academicYear?: string;
  /** Every fee this receipt covers. A single payment produces one line. */
  items?: ReceiptItem[];
  currency?: string;
  method?: string;
  date?: string;
  recordedBy?: string;
  status?: string;
  kind?: string; // "Subscription" | "Fee Payment"
  schoolName?: string;
  schoolMotto?: string;
  schoolAddress?: string;
  // Kept so existing callers that read a single fee off the receipt still work.
  feeName?: string;
  amount?: string | number;
};

/** Normalise a Payment (PaymentDetailSerializer) into ReceiptData. */
export function receiptFromPayment(payment: any, kind?: string): ReceiptData {
  const isPlatform = !payment?.fee_structure;
  const feeName =
    payment?.fee_structure_detail?.name || (isPlatform ? "Platform Subscription" : "School Fee");
  return {
    receiptNo: payment?.receipt_number || payment?.reference_number || "PENDING",
    reference: payment?.reference_number || "",
    studentName: payment?.payer_name || "",
    matricule: payment?.payer_matricule || "",
    studentClass: payment?.payer_class || "",
    academicYear: payment?.academic_year || "",
    items: [{ label: feeName, amount: Number(payment?.amount || 0) }],
    currency: payment?.currency || CURRENCY,
    method: methodLabel(payment?.payment_method),
    date: payment?.payment_date || new Date().toISOString().slice(0, 10),
    recordedBy: payment?.bursar_name || "Bursar",
    status: payment?.status || "confirmed",
    kind: kind || (isPlatform ? "Subscription" : "Fee Payment"),
    schoolName: payment?.school_name || "",
    schoolMotto: payment?.school_motto || "",
    schoolAddress: payment?.school_address || "",
    feeName,
    amount: payment?.amount,
  };
}

/** Normalise a my-fees item into ReceiptData. */
export function receiptFromFeeItem(item: any): ReceiptData {
  const amount = item?.amount_paid || item?.amount;
  const feeName = item?.name || "School Fee";
  return {
    receiptNo: item?.receipt_number || item?.reference_number || "PENDING",
    reference: item?.reference_number || "",
    studentName: item?.student_name || "",
    matricule: item?.student_matricule || item?.matricule || "",
    studentClass: item?.student_class || "",
    academicYear: item?.academic_year || "",
    items: [{ label: feeName, amount: Number(amount || 0) }],
    currency: item?.currency || CURRENCY,
    method: methodLabel(item?.payment_method),
    date: item?.payment_date || new Date().toISOString().slice(0, 10),
    recordedBy: "School Bursar",
    status: item?.status === "paid" ? "confirmed" : (item?.status || ""),
    kind: "Fee Payment",
    schoolName: item?.school_name || "",
    schoolMotto: item?.school_motto || "",
    schoolAddress: item?.school_address || "",
    feeName,
    amount,
  };
}

function field(label: string, value: string): string {
  return `<div class="f"><span class="fl">${escapeHtml(label)}</span><span class="fv">${escapeHtml(value)}</span></div>`;
}

/** One of the two identical halves of the sheet. */
function receiptCopy(data: ReceiptData, schoolName: string, copyLabel: string): string {
  const items = (data.items?.length ? data.items : [{ label: data.feeName || "School Fee", amount: Number(data.amount || 0) }]);
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const rows = items
    .map(
      (item, i) => `<tr>
        <td class="sn">${i + 1}</td>
        <td>${escapeHtml(item.label)}</td>
        <td class="amt">${escapeHtml(receiptMoney(item.amount))}</td>
      </tr>`
    )
    .join("");

  return `<section class="copy">
  <header class="sch">
    <h1>${escapeHtml(schoolName)}</h1>
    ${data.schoolMotto ? `<p class="motto">${escapeHtml(data.schoolMotto)}</p>` : ""}
    ${data.schoolAddress ? `<p class="addr">${escapeHtml(data.schoolAddress)}</p>` : ""}
  </header>
  <div class="rule"></div>
  <h2 class="title">FEE RECEIPT - ${escapeHtml(copyLabel)}</h2>
  <div class="meta">
    <span>Receipt No: <b class="red">${escapeHtml(data.receiptNo)}</b></span>
    ${data.academicYear ? `<span>Academic Year: ${escapeHtml(data.academicYear)}</span>` : ""}
    <span>Date of Issuance: ${escapeHtml(data.date || "")}</span>
  </div>
  <div class="fields">
    ${field("Student Name:", data.studentName || "—")}
    ${data.matricule ? field("Matricule:", data.matricule) : ""}
    ${data.studentClass ? field("Class:", data.studentClass) : ""}
  </div>
  <table>
    <thead>
      <tr><th class="sn">S/N</th><th>Fee Type / Description</th><th class="amt">Amount (${escapeHtml(data.currency || CURRENCY)})</th></tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="2" class="tl">TOTAL AMOUNT PAID</td><td class="amt">${escapeHtml(receiptMoney(total))}</td></tr>
    </tbody>
  </table>
  <div class="fields tight">
    <div class="f"><span class="fl">Amount in words:</span><span class="fv it">${escapeHtml(amountToWords(total))}</span></div>
    ${field("Payment Method:", data.method || "—")}
  </div>
  <div class="foot">
    <div class="note"><b>Note:</b><br/>Fees once paid are not refundable.</div>
    <div class="sign">
      <b>Signed: ${escapeHtml(data.recordedBy || "The Bursar")}</b>
      <div class="sigline"></div>
      <span class="sigcap">Signature &amp; Stamp</span>
    </div>
  </div>
</section>`;
}

export function buildFeeReceiptHtml(data: ReceiptData, schoolName: string): string {
  const school = data.schoolName || schoolName || "EduIgnite School";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(data.receiptNo)}</title>
<style>
  *{box-sizing:border-box;}
  body{margin:0;padding:24px;background:#f1f5f9;color:#0f172a;
       font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:12px;}
  .sheet{max-width:760px;margin:0 auto;}
  .copy{background:#fff;border:1px solid #cbd5e1;padding:26px 30px 22px;}

  .sch{text-align:center;}
  .sch h1{margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;
          letter-spacing:.3px;text-transform:uppercase;color:#0f172a;}
  .motto{margin:7px 0 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:11px;color:#334155;}
  .addr{margin:3px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:11px;color:#334155;}
  .rule{border-top:1px solid #475569;margin:14px 0 16px;}

  .title{margin:0 0 16px;text-align:center;font-size:13px;font-weight:700;letter-spacing:.3px;
         text-decoration:underline;text-underline-offset:3px;}

  .meta{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:11px;margin-bottom:16px;}
  .meta b{font-weight:700;}
  .red{color:#c81e1e;}

  .fields{margin-bottom:14px;}
  .fields.tight{margin:12px 0 16px;}
  .f{display:flex;gap:10px;align-items:baseline;border-bottom:1px dotted #94a3b8;padding:5px 0;}
  .fl{font-weight:700;white-space:nowrap;}
  .fv{flex:1;}
  .it{font-style:italic;}

  table{width:100%;border-collapse:collapse;margin:2px 0 0;}
  th,td{border:1px solid #94a3b8;padding:7px 10px;font-size:11px;text-align:left;}
  th{background:#f1f5f9;font-weight:700;}
  .sn{width:38px;text-align:center;}
  .amt{text-align:right;white-space:nowrap;}
  th.amt{text-align:right;}
  .total td{font-weight:700;}
  .total .tl{text-align:right;border-left:none;}

  .foot{display:flex;justify-content:space-between;gap:24px;margin-top:22px;}
  .note{font-size:11px;color:#334155;line-height:1.6;}
  .sign{text-align:center;min-width:230px;font-size:11px;}
  .sigline{border-bottom:1px solid #475569;margin:26px 0 5px;}
  .sigcap{font-style:italic;font-size:10px;color:#64748b;}

  .cut{display:flex;align-items:center;gap:12px;color:#94a3b8;font-size:10px;
       letter-spacing:2px;font-weight:700;margin:26px 0;}
  .cut::before,.cut::after{content:"";flex:1;border-top:1px dashed #94a3b8;}

  @media print{
    body{background:#fff;padding:0;font-size:11px;}
    .copy{border:1px solid #cbd5e1;}
    .cut{margin:18px 0;}
    @page{margin:12mm;}
  }
</style></head>
<body><div class="sheet">
  ${receiptCopy(data, school, "SCHOOL COPY")}
  <div class="cut">&#9986; CUT HERE</div>
  ${receiptCopy(data, school, "STUDENT COPY")}
</div></body></html>`;
}

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [71, 85, 105];
const RULE: [number, number, number] = [148, 163, 184];
const RED: [number, number, number] = [200, 30, 30];

/** Draws one receipt copy and returns the y just past its footer. */
function drawReceiptCopy(
  doc: jsPDF,
  data: ReceiptData,
  school: string,
  copyLabel: string,
  left: number,
  right: number,
  top: number
): number {
  const width = right - left;
  const mid = left + width / 2;
  let y = top;

  // ---- School identity ----
  doc.setTextColor(...INK);
  doc.setFont("times", "bold");
  doc.setFontSize(13.5);
  doc.text(school.toUpperCase(), mid, y, { align: "center", maxWidth: width });
  y += 5.5;

  if (data.schoolMotto) {
    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(data.schoolMotto, mid, y, { align: "center", maxWidth: width });
    y += 4.4;
  }
  if (data.schoolAddress) {
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(data.schoolAddress, mid, y, { align: "center", maxWidth: width });
    y += 4.4;
  }

  y += 1.5;
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 7;

  // ---- Title, underlined ----
  const title = `FEE RECEIPT - ${copyLabel}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(title, mid, y, { align: "center" });
  const titleWidth = doc.getTextWidth(title);
  doc.setLineWidth(0.35);
  doc.setDrawColor(...INK);
  doc.line(mid - titleWidth / 2, y + 1.2, mid + titleWidth / 2, y + 1.2);
  y += 8;

  // ---- Meta row ----
  doc.setFontSize(8.2);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  const receiptLabel = "Receipt No: ";
  doc.text(receiptLabel, left, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RED);
  doc.text(data.receiptNo, left + doc.getTextWidth(receiptLabel), y);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  if (data.academicYear) {
    doc.text(`Academic Year: ${data.academicYear}`, mid, y, { align: "center" });
  }
  doc.text(`Date of Issuance: ${data.date || ""}`, right, y, { align: "right" });
  y += 6.5;

  // ---- Dotted identity fields ----
  const dottedField = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.setTextColor(...INK);
    doc.text(label, left, y);
    // Measure while still bold — the bold label is wider than the same string
    // in the normal weight, and measuring after the switch runs the value into
    // the label.
    const labelWidth = doc.getTextWidth(label);
    doc.setFont("helvetica", "normal");
    doc.text(value, left + labelWidth + 2.5, y);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.5, 0.6], 0);
    doc.line(left, y + 1.8, right, y + 1.8);
    doc.setLineDashPattern([], 0);
    y += 6.2;
  };

  dottedField("Student Name:", data.studentName || "—");
  if (data.matricule) dottedField("Matricule:", data.matricule);
  if (data.studentClass) dottedField("Class:", data.studentClass);

  y += 1.5;

  // ---- Fee table ----
  const items = data.items?.length
    ? data.items
    : [{ label: data.feeName || "School Fee", amount: Number(data.amount || 0) }];
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  autoTable(doc, {
    startY: y,
    margin: { left, right: doc.internal.pageSize.getWidth() - right },
    tableWidth: width,
    head: [["S/N", "Fee Type / Description", `Amount (${data.currency || CURRENCY})`]],
    body: [
      ...items.map((item, i) => [String(i + 1), item.label, receiptMoney(item.amount)]),
      ["", "TOTAL AMOUNT PAID", receiptMoney(total)],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.2, textColor: INK, cellPadding: 2, lineColor: RULE, lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 11, halign: "center" },
      2: { halign: "right", cellWidth: 40 },
    },
    didParseCell: (cell) => {
      const isTotalRow = cell.section === "body" && cell.row.index === items.length;
      if (isTotalRow) {
        cell.cell.styles.fontStyle = "bold";
        if (cell.column.index === 1) cell.cell.styles.halign = "right";
      }
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  // ---- Words + method ----
  dottedField("Amount in words:", amountToWords(total));
  dottedField("Payment Method:", data.method || "—");

  // ---- Footer: note left, signature right ----
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...INK);
  doc.text("Note:", left, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("Fees once paid are not refundable.", left, y + 4.5);

  const signLeft = right - 62;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(`Signed: ${data.recordedBy || "The Bursar"}`, right, y, { align: "right" });
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(signLeft, y + 11, right, y + 11);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Signature & Stamp", (signLeft + right) / 2, y + 15, { align: "center" });

  return y + 19;
}

/** The full sheet: both copies, divided by a cut line. */
export function buildFeeReceiptPdf(data: ReceiptData, schoolName: string): jsPDF {
  const school = data.schoolName || schoolName || "EduIgnite School";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageWidth - 14;

  const afterFirst = drawReceiptCopy(doc, data, school, "SCHOOL COPY", left, right, 20);

  // Cut line, with the label sitting in a gap in the middle of the dashes.
  const cutY = afterFirst + 8;
  // No scissors glyph: jsPDF's standard fonts are WinAnsi, and ✂ falls back to
  // a stray apostrophe.
  const label = "CUT HERE";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...RULE);
  const labelWidth = doc.getTextWidth(label) + 6;
  const mid = pageWidth / 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(left, cutY, mid - labelWidth / 2, cutY);
  doc.line(mid + labelWidth / 2, cutY, right, cutY);
  doc.setLineDashPattern([], 0);
  doc.text(label, mid, cutY + 1.2, { align: "center" });

  drawReceiptCopy(doc, data, school, "STUDENT COPY", left, right, cutY + 14);

  return doc;
}

function receiptFileName(data: ReceiptData): string {
  return `receipt_${data.receiptNo || "fee"}`.replace(/[^a-z0-9_.-]+/gi, "_");
}

/** Download the receipt as a PDF. */
export function downloadReceiptPdf(data: ReceiptData, schoolName: string) {
  buildFeeReceiptPdf(data, schoolName).save(`${receiptFileName(data)}.pdf`);
}

/** Open the receipt PDF in the print dialog. */
export function printReceiptPdf(data: ReceiptData, schoolName: string) {
  const doc = buildFeeReceiptPdf(data, schoolName);
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}

export function downloadReceiptHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[^a-z0-9_.-]+/gi, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function printReceiptHtml(html: string) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
