/**
 * The two library request documents.
 *
 * - `buildRequesterDocumentHtml` — the requester's confirmation (a student, or
 *   a teacher who asked for a book): friendly, school-branded, easy to read.
 * - `buildOfficialRecordHtml` — the administrative record for librarians and
 *   school administrators: formal letterhead, full circulation detail, a
 *   timeline of recorded events and the internal notes.
 *
 * Both are filled only from what the server returned for that document, which
 * is decided server-side by who is asking (see the library app's
 * `documents.py`). The requester payload never contains administrative notes,
 * so this file cannot leak them. Empty values are simply not rendered, and the
 * school's name, crest, motto and contact details always come from the
 * school's own profile.
 *
 * This file is identical in the website, mobile and desktop apps.
 */
import { resolveMediaUrl } from "@/lib/media";

type SchoolBranding = {
  name?: string;
  short_name?: string;
  motto?: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
};

type TimelineEvent = { event: string; at?: string; by?: string };

export type LibraryRequestDocumentData = {
  reference: string;
  request_type: string;
  status: string;
  display_status: string;
  submitted_at?: string;
  requester_note?: string;
  school?: SchoolBranding;
  book?: {
    title?: string;
    author?: string;
    category?: string;
    isbn?: string;
    publisher?: string;
    publication_year?: number;
    location?: string;
    is_active?: boolean;
    total_copies?: number;
    available_copies?: number;
  };
  requester?: {
    name?: string;
    role?: string;
    role_label?: string;
    admission_number?: string;
    class_name?: string;
    matricule?: string;
  };
  review?: { reviewed_by?: string; reviewed_at?: string; review_note?: string };
  loan?: {
    issued_date?: string;
    due_date?: string;
    returned_date?: string;
    status?: string;
    issued_by?: string;
    fine_amount?: string;
    fine_paid?: boolean;
  };
  timeline?: TimelineEvent[];
  administrative_notes?: string;
  generated_at?: string;
};

type Row = [label: string, value: string | number | null | undefined];

const NAVY = "#173A5B";
const INK = "#12314D";
const CYAN = "#15809A";
const MUTED = "#64748B";
const LINE = "#DDE5EE";
const SOFT = "#F5F9FC";

function escapeHtml(value: unknown) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "loan" -> "Loan", "soft_copy" -> "Soft Copy": never raw database values. */
export function humanize(value?: string | null) {
  return `${value ?? ""}`
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** 28 September 2026 */
export function formatDocumentDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${formatDocumentDate(value)}, ${parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const STATUS_TONE: Record<string, { fg: string; bg: string; border: string }> = {
  pending: { fg: "#8A5A00", bg: "#FFF7E0", border: "#F2D38A" },
  approved: { fg: "#0F6B3F", bg: "#E8F7EF", border: "#A9DEC2" },
  issued: { fg: "#0F5E7A", bg: "#E6F6FA", border: "#9FD8E6" },
  fulfilled: { fg: "#0F6B3F", bg: "#E8F7EF", border: "#A9DEC2" },
  returned: { fg: "#334155", bg: "#F1F5F9", border: "#CBD5E1" },
  overdue: { fg: "#9A2A12", bg: "#FDEDE8", border: "#F2B5A4" },
  lost: { fg: "#9A2A12", bg: "#FDEDE8", border: "#F2B5A4" },
  rejected: { fg: "#9A2A12", bg: "#FDEDE8", border: "#F2B5A4" },
  cancelled: { fg: "#475569", bg: "#F1F5F9", border: "#CBD5E1" },
};

function tone(status: string) {
  return STATUS_TONE[status] ?? STATUS_TONE.pending;
}

/** The sentence under the status on the requester's document. */
export function statusMessage(data: Pick<LibraryRequestDocumentData, "display_status" | "request_type" | "loan">) {
  switch (data.display_status) {
    case "pending":
      return "Your request is currently awaiting librarian review.";
    case "approved":
      return "Your request has been approved.";
    case "issued":
      return data.loan?.due_date
        ? `This book has been issued to you. Please return it by ${formatDocumentDate(data.loan.due_date)}.`
        : "This book has been issued to you.";
    case "overdue":
      return "This book is past its return date. Please return it to the library.";
    case "fulfilled":
      return data.request_type === "soft_copy"
        ? "Your request has been fulfilled. The soft copy is available from the library portal."
        : "Your request has been fulfilled.";
    case "returned":
      return "This library item has been returned.";
    case "lost":
      return "This library item has been recorded as lost. Please see the librarian.";
    case "rejected":
      return "Your request was not approved.";
    case "cancelled":
      return "This request was cancelled.";
    default:
      return "";
  }
}

function rowsHtml(rows: Row[], className: string) {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== "")
    .map(
      ([label, value]) =>
        `<div class="${className}"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`,
    )
    .join("");
}

function hasRows(rows: Row[]) {
  return rows.some(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== "");
}

function logoHtml(school: SchoolBranding | undefined, className: string) {
  const src = resolveMediaUrl(school?.logo || "");
  return src ? `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(school?.name || "School")} logo" />` : "";
}

// ── Requester document ──────────────────────────────────────────────────────

export function buildRequesterDocumentHtml(data: LibraryRequestDocumentData) {
  const school = data.school ?? {};
  const book = data.book ?? {};
  const requester = data.requester ?? {};
  const review = data.review ?? {};
  const loan = data.loan ?? {};
  const statusTone = tone(data.display_status);

  const bookRows: Row[] = [
    ["Title", book.title],
    ["Author", book.author],
    ["Category", book.category],
    ["ISBN", book.isbn],
  ];
  const requesterRows: Row[] = requester.admission_number || requester.class_name
    ? [["Name", requester.name], ["Class", requester.class_name], ["Admission Number", requester.admission_number]]
    : [["Name", requester.name], ["Role", requester.role_label]];
  const requestRows: Row[] = [
    ["Request Type", humanize(data.request_type)],
    ["Date Submitted", formatDocumentDate(data.submitted_at)],
    ["Current Status", humanize(data.display_status)],
    ["Your Note", data.requester_note],
  ];
  const reviewRows: Row[] = [
    ["Reviewed By", review.reviewed_by],
    ["Review Date", formatDocumentDate(review.reviewed_at)],
    ["Review Note", review.review_note],
  ];
  const loanRows: Row[] = [
    ["Issue Date", formatDocumentDate(loan.issued_date)],
    ["Expected Return Date", formatDocumentDate(loan.due_date)],
    ["Actual Return Date", formatDocumentDate(loan.returned_date)],
  ];

  const card = (title: string, rows: Row[], extra = "") =>
    `<section class="lr-card${extra}"><h2>${escapeHtml(title)}</h2>${rowsHtml(rows, "lr-row")}</section>`;

  return `
    <style>
      .lr{box-sizing:border-box;width:794px;min-height:1123px;margin:0 auto;background:#fff;color:${INK};
        font-family:'Segoe UI',Arial,Helvetica,sans-serif;padding:48px 56px 40px;display:flex;flex-direction:column}
      .lr *{box-sizing:border-box}
      .lr-head{text-align:center}
      .lr-logo{width:72px;height:72px;object-fit:contain;display:block;margin:0 auto 10px}
      .lr-school{font-size:22px;font-weight:800;letter-spacing:.3px;color:${NAVY};text-transform:uppercase}
      .lr-motto{font-size:12.5px;font-style:italic;color:${MUTED};margin-top:4px}
      .lr-divider{height:4px;border-radius:4px;margin:20px auto 26px;width:100%;
        background:linear-gradient(90deg,${NAVY} 0%,${NAVY} 60%,#67D0E4 60%,#67D0E4 100%)}
      .lr-title{text-align:center;font-size:30px;font-weight:900;letter-spacing:6px;color:${NAVY};margin:0}
      .lr-ref{text-align:center;margin-top:8px;font-size:13px;color:${MUTED}}
      .lr-ref b{color:${INK};font-family:Consolas,'Courier New',monospace;letter-spacing:1px}
      .lr-status{margin:24px 0 26px;border:1.5px solid ${statusTone.border};background:${statusTone.bg};
        border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:18px}
      .lr-pill{flex:none;font-size:15px;font-weight:900;letter-spacing:3px;color:${statusTone.fg};
        border:2px solid ${statusTone.fg};border-radius:999px;padding:6px 16px;background:#fff}
      .lr-status p{margin:0;font-size:14px;line-height:1.5;color:${statusTone.fg}}
      .lr-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .lr-card{border:1px solid ${LINE};border-radius:14px;padding:16px 18px;background:#fff}
      .lr-card.wide{grid-column:1 / -1}
      .lr-card h2{margin:0 0 10px;font-size:11.5px;font-weight:800;letter-spacing:2px;color:${CYAN}}
      .lr-row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-top:1px dashed ${LINE};font-size:13.5px}
      .lr-row:first-of-type{border-top:none}
      .lr-row .k{color:${MUTED};flex:none}
      .lr-row .v{font-weight:600;text-align:right;white-space:pre-wrap;word-break:break-word}
      .lr-empty{margin:0;font-size:13.5px;color:${MUTED}}
      .lr-foot{margin-top:auto;padding-top:28px;text-align:center;font-size:11px;color:${MUTED}}
      .lr-foot b{color:${NAVY}}
    </style>
    <div class="lr">
      <header class="lr-head">
        ${logoHtml(school, "lr-logo")}
        ${school.name ? `<div class="lr-school">${escapeHtml(school.name)}</div>` : ""}
        ${school.motto ? `<div class="lr-motto">&ldquo;${escapeHtml(school.motto)}&rdquo;</div>` : ""}
      </header>
      <div class="lr-divider"></div>
      <h1 class="lr-title">LIBRARY REQUEST</h1>
      <div class="lr-ref">Request ID: <b>${escapeHtml(data.reference)}</b></div>

      <div class="lr-status">
        <span class="lr-pill">${escapeHtml(humanize(data.display_status).toUpperCase())}</span>
        <p>${escapeHtml(statusMessage(data))}</p>
      </div>

      <div class="lr-grid">
        ${hasRows(bookRows) ? card("BOOK DETAILS", bookRows) : ""}
        ${hasRows(requesterRows) ? card("REQUESTER", requesterRows) : ""}
        ${card("REQUEST DETAILS", requestRows, hasRows(loanRows) ? "" : " wide")}
        ${hasRows(loanRows) ? card("LOAN DETAILS", loanRows) : ""}
        ${
          hasRows(reviewRows)
            ? card("LIBRARY RESPONSE", reviewRows, " wide")
            : `<section class="lr-card wide"><h2>LIBRARY RESPONSE</h2><p class="lr-empty">Your request has not yet been reviewed by the librarian.</p></section>`
        }
      </div>

      <footer class="lr-foot">
        Keep this confirmation for your records. &middot; Issued through the <b>EduIgnite Library Portal</b>
        ${data.generated_at ? `<br />Generated ${escapeHtml(formatDateTime(data.generated_at))}` : ""}
      </footer>
    </div>`;
}

// ── Official record ─────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  issued: "Issued",
  fulfilled: "Fulfilled",
  returned: "Returned",
  lost: "Recorded as lost",
};

export function buildOfficialRecordHtml(data: LibraryRequestDocumentData) {
  const school = data.school ?? {};
  const book = data.book ?? {};
  const requester = data.requester ?? {};
  const review = data.review ?? {};
  const loan = data.loan ?? {};
  const statusTone = tone(data.display_status);
  const isStudent = Boolean(requester.admission_number || requester.class_name);

  const overviewRows: Row[] = [
    ["Request ID", data.reference],
    ["Request Type", humanize(data.request_type)],
    ["Status", humanize(data.display_status)],
    ["Submitted", formatDocumentDate(data.submitted_at)],
    ["Reviewed", review.reviewed_by ? `${review.reviewed_by}${review.reviewed_at ? `, ${formatDocumentDate(review.reviewed_at)}` : ""}` : "Not yet reviewed"],
  ];
  const copies =
    book.total_copies !== undefined
      ? `${book.available_copies ?? 0} of ${book.total_copies} available`
      : "";
  const bookRows: Row[] = [
    ["Book Title", book.title],
    ["Author", book.author],
    ["ISBN", book.isbn],
    ["Category", book.category],
    ["Publisher", [book.publisher, book.publication_year].filter(Boolean).join(", ")],
    ["Shelf / Location", book.location],
    ["Book Status", book.is_active === undefined ? "" : book.is_active ? "In circulation" : "Archived"],
    ["Copies", copies],
  ];
  const requesterRows: Row[] = isStudent
    ? [["Name", requester.name], ["Admission Number", requester.admission_number], ["Class", requester.class_name], ["Role", requester.role_label]]
    : [["Name", requester.name], ["Staff Matricule", requester.matricule], ["Role", requester.role_label]];
  const detailRows: Row[] = [
    ["Request Type", humanize(data.request_type)],
    ["Submission Date", formatDateTime(data.submitted_at)],
    ["Current Status", humanize(data.display_status)],
    ["Requester Note", data.requester_note],
    ["Reviewed By", review.reviewed_by],
    ["Review Date", formatDateTime(review.reviewed_at)],
    ["Review Note", review.review_note],
  ];
  const fine = loan.fine_amount
    ? `${loan.fine_amount}${loan.fine_paid === undefined ? "" : loan.fine_paid ? " (paid)" : " (unpaid)"}`
    : "";
  const circulationRows: Row[] = [
    ["Issue Date", formatDocumentDate(loan.issued_date)],
    ["Expected Return Date", formatDocumentDate(loan.due_date)],
    ["Actual Return Date", formatDocumentDate(loan.returned_date)],
    ["Issued By", loan.issued_by],
    ["Loan Status", loan.status],
    ["Fine", fine],
  ];

  const section = (title: string, rows: Row[]) =>
    hasRows(rows) ? `<section class="or-sec"><h2>${escapeHtml(title)}</h2><div class="or-table">${rowsHtml(rows, "or-row")}</div></section>` : "";

  const timeline = (data.timeline ?? [])
    .map(
      (event) => `
        <li>
          <span class="dot"></span>
          <div><b>${escapeHtml(EVENT_LABELS[event.event] ?? humanize(event.event))}</b>
            ${event.at ? `<span class="when">${escapeHtml(event.event === "submitted" ? formatDateTime(event.at) : formatDocumentDate(event.at))}</span>` : ""}
            ${event.by ? `<span class="by">by ${escapeHtml(event.by)}</span>` : ""}
          </div>
        </li>`,
    )
    .join("");

  const contact = [school.phone ? `Tel: ${school.phone}` : "", school.email ? `Email: ${school.email}` : ""].filter(Boolean).join(" &nbsp;|&nbsp; ");

  return `
    <style>
      .or{box-sizing:border-box;width:794px;min-height:1123px;margin:0 auto;background:#fff;color:${INK};
        font-family:Georgia,'Times New Roman',serif;padding:40px 52px 30px;display:flex;flex-direction:column}
      .or *{box-sizing:border-box}
      .or-letterhead{display:flex;align-items:center;gap:18px}
      .or-logo{width:78px;height:78px;object-fit:contain;flex:none}
      .or-school{font-size:21px;font-weight:700;color:${NAVY};text-transform:uppercase;letter-spacing:.4px}
      .or-motto{font-style:italic;font-size:12px;color:${MUTED};margin-top:2px}
      .or-contact{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${MUTED};margin-top:5px;line-height:1.5}
      .or-rule{border-top:3px solid ${NAVY};border-bottom:1px solid ${NAVY};height:6px;margin:16px 0 18px}
      .or-titlebar{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
      .or-title{margin:0;font-size:22px;letter-spacing:3px;color:${NAVY}}
      .or-meta{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};margin-top:6px;line-height:1.6}
      .or-meta b{color:${INK}}
      .or-stamp{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:13px;letter-spacing:3px;
        color:${statusTone.fg};border:2px solid ${statusTone.fg};padding:6px 14px;border-radius:4px;flex:none}
      .or-overview{margin:18px 0 6px;display:grid;grid-template-columns:repeat(5,1fr);border:1px solid ${LINE};background:${SOFT}}
      .or-overview .or-row{display:flex;flex-direction:column;padding:10px 12px;border-left:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif}
      .or-overview .or-row:first-child{border-left:none}
      .or-overview .k{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED}}
      .or-overview .v{font-size:12.5px;font-weight:700;margin-top:3px;word-break:break-word}
      .or-cols{display:grid;grid-template-columns:1fr 1fr;gap:0 26px}
      .or-sec{margin-top:16px;break-inside:avoid}
      .or-sec h2{margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:2px;
        color:${NAVY};border-bottom:2px solid ${NAVY};padding-bottom:4px}
      .or-table .or-row{display:grid;grid-template-columns:42% 58%;font-family:Arial,Helvetica,sans-serif;font-size:12px;
        padding:5px 0;border-bottom:1px solid ${LINE}}
      .or-table .k{color:${MUTED}}
      .or-table .v{font-weight:600;white-space:pre-wrap;word-break:break-word}
      .or-timeline{list-style:none;margin:6px 0 0;padding:0 0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px}
      .or-timeline li{position:relative;padding:0 0 12px 22px;border-left:2px solid ${LINE}}
      .or-timeline li:last-child{border-left-color:transparent;padding-bottom:0}
      .or-timeline .dot{position:absolute;left:-7px;top:1px;width:12px;height:12px;border-radius:50%;background:${NAVY};border:2px solid #fff;box-shadow:0 0 0 1px ${NAVY}}
      .or-timeline .when{color:${MUTED};margin-left:8px}
      .or-timeline .by{color:${MUTED};margin-left:6px}
      .or-notes{margin-top:6px;border:1px solid #F2D38A;background:#FFFBEB;padding:10px 12px;font-family:Arial,Helvetica,sans-serif;
        font-size:12px;white-space:pre-wrap;line-height:1.5}
      .or-notes small{display:block;margin-bottom:4px;font-size:9.5px;letter-spacing:1.2px;color:#8A5A00;font-weight:700}
      .or-foot{margin-top:auto;padding-top:22px;border-top:1px solid ${LINE};display:flex;justify-content:space-between;
        align-items:flex-end;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:${MUTED}}
      .or-foot b{color:${NAVY};font-size:11.5px}
    </style>
    <div class="or">
      <header class="or-letterhead">
        ${logoHtml(school, "or-logo")}
        <div>
          ${school.name ? `<div class="or-school">${escapeHtml(school.name)}</div>` : ""}
          ${school.motto ? `<div class="or-motto">&ldquo;${escapeHtml(school.motto)}&rdquo;</div>` : ""}
          ${school.address || contact ? `<div class="or-contact">${escapeHtml(school.address || "")}${school.address && contact ? "<br />" : ""}${contact}</div>` : ""}
        </div>
      </header>
      <div class="or-rule"></div>

      <div class="or-titlebar">
        <div>
          <h1 class="or-title">LIBRARY REQUEST RECORD</h1>
          <div class="or-meta">
            Request ID: <b>${escapeHtml(data.reference)}</b> &nbsp;&middot;&nbsp;
            Status: <b>${escapeHtml(humanize(data.display_status).toUpperCase())}</b>
            ${data.submitted_at ? `&nbsp;&middot;&nbsp; Submitted: <b>${escapeHtml(formatDocumentDate(data.submitted_at))}</b>` : ""}
          </div>
        </div>
        <span class="or-stamp">${escapeHtml(humanize(data.display_status).toUpperCase())}</span>
      </div>

      <div class="or-overview">${rowsHtml(overviewRows, "or-row")}</div>

      <div class="or-cols">
        <div>
          ${section("BOOK INFORMATION", bookRows)}
          ${section("CIRCULATION INFORMATION", circulationRows)}
        </div>
        <div>
          ${section("REQUESTER INFORMATION", requesterRows)}
          ${section("REQUEST DETAILS", detailRows)}
        </div>
      </div>

      ${timeline ? `<section class="or-sec"><h2>ADMINISTRATIVE TIMELINE</h2><ul class="or-timeline">${timeline}</ul></section>` : ""}

      ${
        data.administrative_notes
          ? `<section class="or-sec"><h2>ADMINISTRATIVE NOTES</h2><div class="or-notes"><small>INTERNAL &mdash; FOR AUTHORISED STAFF ONLY</small>${escapeHtml(data.administrative_notes)}</div></section>`
          : ""
      }

      <footer class="or-foot">
        <div><b>Official Library Record</b><br />Generated by EduIgnite Library Portal &middot; Powered by ELIGNITE</div>
        ${data.generated_at ? `<div>Generated ${escapeHtml(formatDateTime(data.generated_at))}</div>` : ""}
      </footer>
    </div>`;
}
