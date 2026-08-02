import { resolveMediaUrl } from "@/lib/media";

/**
 * Official multi-year transcript.
 *
 * Renders the exact official-transcript design used across web, desktop and
 * mobile: bilingual Cameroon header with region/division/P.O. box, school
 * crest, OFFICIAL TRANSCRIPT title, student identity box, the First Cycle
 * table (each class level with T1/T2/T3/Ann per subject and a coefficient-
 * weighted annual average row), the Second Cycle table, and the Date /
 * Registrar-Principal signature lines. The same HTML is shown on screen and
 * rendered into the downloaded PDF so the document is identical everywhere.
 */

const NAVY = "#17385a";

function escapeHtml(value: unknown) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clean(value: unknown, fallback = "") {
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

function fmt(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}

function formatDate(value: unknown) {
  const text = `${value ?? ""}`.trim();
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function sexLabel(value: unknown) {
  const text = `${value ?? ""}`.trim().toLowerCase();
  if (["male", "m", "masculin"].includes(text)) return "Male";
  if (["female", "f", "feminin", "féminin"].includes(text)) return "Female";
  return clean(value);
}

type CycleData = {
  levels: string[];
  rows: { subject: string; coefficient?: number; cells: Record<string, { t1: number | null; t2: number | null; t3: number | null; ann: number | null } | null> }[];
  annual: Record<string, number | null>;
};

function cycleTable(title: string, cycle: CycleData | undefined | null) {
  const levels = cycle?.levels || [];
  const rows = cycle?.rows || [];
  if (!levels.length || !rows.length) return "";

  const levelHeads = levels
    .map((level) => `<th colspan="4" class="lvl">${escapeHtml(level.toUpperCase())}</th>`)
    .join("");
  const termHeads = levels
    .map(() => `<th>T1</th><th>T2</th><th>T3</th><th class="ann">Ann</th>`)
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = levels
        .map((level) => {
          const cell = row.cells?.[level];
          if (!cell) return `<td></td><td></td><td></td><td class="ann"></td>`;
          return `<td>${fmt(cell.t1)}</td><td>${fmt(cell.t2)}</td><td>${fmt(cell.t3)}</td><td class="ann">${fmt(cell.ann)}</td>`;
        })
        .join("");
      return `<tr><td class="subj">${escapeHtml(row.subject)}</td>${cells}</tr>`;
    })
    .join("");

  const annualCells = levels
    .map((level) => {
      const avg = cycle?.annual?.[level];
      const label = avg === null || avg === undefined ? "" : `${fmt(avg)}/20`;
      return `<td colspan="3"></td><td class="ann avg">${label}</td>`;
    })
    .join("");

  return `
    <div class="cycle-bar">${escapeHtml(title)}</div>
    <table class="tr-tbl">
      <thead>
        <tr><th rowspan="2" class="subj-h">SUBJECTS</th>${levelHeads}</tr>
        <tr>${termHeads}</tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr class="annual"><td class="subj">ANNUAL AVERAGE</td>${annualCells}</tr>
      </tbody>
    </table>
  `;
}

export function buildOfficialTranscriptHtml(data: any) {
  const student = data?.student || {};
  const school = data?.school || {};
  const logo = resolveMediaUrl(clean(school.logo || school.logo_url));
  const photo = resolveMediaUrl(clean(student.photo || student.avatar));
  const region = clean(school.region);
  const division = clean(school.division || school.department);
  const poBox = clean(school.postal_code || school.address || school.location);

  return `
    <style>
      .transcript-wrap{width:100%;overflow-x:auto;background:#eef1f4;padding:8px}
      .transcript{box-sizing:border-box;width:1123px;margin:0 auto;background:#fff;color:#111827;
        padding:26px 34px 30px;font-family:Arial,Helvetica,sans-serif;font-size:12px}
      .transcript *{box-sizing:border-box}
      .tr-head{display:grid;grid-template-columns:1fr 110px 1fr;gap:8px;align-items:start;text-align:center}
      .tr-head .side{font-size:11.5px;line-height:1.6;color:#1f2937;font-family:Georgia,'Times New Roman',serif}
      .tr-head .side b{display:block;font-size:12px;color:#111827;letter-spacing:.3px}
      .tr-logo{width:76px;height:76px;border-radius:50%;border:2px solid ${NAVY};margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;color:${NAVY};font-weight:700;font-size:11px;letter-spacing:1px;font-family:Georgia,serif}
      .tr-logo img{width:100%;height:100%;object-fit:contain}
      .tr-school{text-align:center;font-weight:700;font-size:17px;color:${NAVY};margin-top:10px;letter-spacing:.5px;text-transform:uppercase;font-family:Georgia,serif}
      .tr-title{text-align:center;font-weight:700;font-size:19px;color:#111827;letter-spacing:5px;margin:8px 0 10px}
      .tr-rule{height:3px;background:${NAVY};margin-bottom:16px}
      .tr-id{display:grid;grid-template-columns:120px 1fr;gap:16px;margin-bottom:18px}
      .tr-photo{border:1.5px solid ${NAVY};border-radius:10px;background:#f5f8fb;height:110px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;overflow:hidden}
      .tr-photo img{width:100%;height:100%;object-fit:cover}
      .tr-info{border:1.5px solid ${NAVY};border-radius:10px;padding:14px 18px;display:grid;grid-template-columns:150px 1fr 150px 1fr;gap:10px 8px;align-content:center;font-size:12.5px}
      .tr-info .k{font-weight:700;color:#111827}
      .cycle-bar{background:${NAVY};color:#fff;font-weight:700;letter-spacing:.6px;padding:8px 14px;border-radius:4px 4px 0 0;font-size:12.5px;margin-top:14px}
      table.tr-tbl{width:100%;border-collapse:collapse;font-size:11px;text-align:center}
      table.tr-tbl th{border:1px solid ${NAVY};padding:5px 3px;font-weight:700;color:#111827;background:#f1f5f9}
      table.tr-tbl th.lvl{background:#e8eef5;color:${NAVY}}
      table.tr-tbl th.subj-h{text-align:left;padding-left:8px;background:#fff;color:#6b7280;font-size:10px}
      table.tr-tbl th.ann{background:#dbe4ee}
      table.tr-tbl td{border:1px solid #b6c2d1;padding:5px 3px;color:#1f2937}
      table.tr-tbl td.subj{text-align:left;padding-left:8px;font-weight:700;color:#111827}
      table.tr-tbl td.ann{font-weight:700;color:${NAVY};background:#f4f7fa}
      table.tr-tbl tr.annual td{background:#eef3f8;font-weight:700;color:${NAVY};border-color:${NAVY}}
      table.tr-tbl tr.annual td.avg{font-size:11.5px}
      .tr-foot{display:flex;justify-content:space-between;margin-top:34px;padding:0 24px}
      .tr-foot .sig{text-align:center;font-size:12px;font-weight:700;color:#111827}
      .tr-foot .sig .line{border-top:1.5px solid #111827;width:230px;margin-bottom:6px}
      @media print{html,body{background:#fff!important}.transcript-wrap{padding:0;background:#fff;overflow:visible}}
    </style>
    <div class="transcript-wrap">
      <section class="transcript">
        <header class="tr-head">
          <div class="side">
            <b>REPUBLIC OF CAMEROON</b>
            Peace - Work - Fatherland<br />
            Ministry of Secondary Education<br />
            ${region ? `${escapeHtml(region)}<br />` : ""}
            ${division ? `${escapeHtml(division)}<br />` : ""}
            ${poBox ? `P.O Box: ${escapeHtml(poBox)}` : ""}
          </div>
          <div class="tr-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="logo" />` : "LOGO"}</div>
          <div class="side">
            <b>REPUBLIQUE DU CAMEROUN</b>
            Paix - Travail - Patrie<br />
            Ministère des Enseignements Secondaires<br />
            ${region ? `Région: ${escapeHtml(region)}<br />` : ""}
            ${division ? `Département: ${escapeHtml(division)}<br />` : ""}
            ${poBox ? `B.P: ${escapeHtml(poBox)}` : ""}
          </div>
        </header>

        <div class="tr-school">${escapeHtml(clean(school.name, "SCHOOL NAME"))}</div>
        <div class="tr-title">OFFICIAL TRANSCRIPT</div>
        <div class="tr-rule"></div>

        <div class="tr-id">
          <div class="tr-photo">${photo ? `<img src="${escapeHtml(photo)}" alt="photo" />` : "Photo"}</div>
          <div class="tr-info">
            <span class="k">Student Name:</span><span>${escapeHtml(clean(student.name))}</span>
            <span class="k">Date of Birth:</span><span>${escapeHtml(formatDate(student.date_of_birth))}</span>
            <span class="k">Matricule:</span><span>${escapeHtml(clean(student.matricule || student.admission_number))}</span>
            <span class="k">Sex:</span><span>${escapeHtml(sexLabel(student.sex))}</span>
          </div>
        </div>

        ${cycleTable("FIRST CYCLE (FORM 1 TO FORM 5)", data?.first_cycle)}
        ${cycleTable("SECOND CYCLE (LOWER SIXTH TO UPPER SIXTH)", data?.second_cycle)}

        ${!(data?.first_cycle?.rows?.length || data?.second_cycle?.rows?.length)
          ? `<p style="text-align:center;color:#6b7280;padding:26px 0;font-size:13px">No recorded marks are available yet for this student.</p>`
          : ""}

        <div class="tr-foot">
          <div class="sig"><div class="line"></div>Date</div>
          <div class="sig"><div class="line"></div>Registrar / Principal Signature</div>
        </div>
      </section>
    </div>
  `;
}

export default buildOfficialTranscriptHtml;
