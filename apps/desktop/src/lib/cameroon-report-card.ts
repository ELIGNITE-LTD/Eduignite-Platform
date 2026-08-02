import { resolveMediaUrl } from "@/lib/media";

type ReportCardBuildOptions = {
  title?: string;
  school?: Record<string, any> | null;
  student?: Record<string, any> | null;
  attendance?: Record<string, any> | null;
  qrCode?: string | null;
  verifyUrl?: string | null;
  includeDocument?: boolean;
};

const NAVY = "#17385a";

function escapeHtml(value: unknown) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value: unknown, fallback = "") {
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

function getNested(record: Record<string, any>, paths: string[], fallback = "") {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((current, key) => current?.[key], record);
    if (value !== undefined && value !== null && `${value}`.trim() !== "") return value;
  }
  return fallback;
}

function termName(term?: number | string | null) {
  const value = Number(term);
  if (value === 1) return "First Term";
  if (value === 2) return "Second Term";
  if (value === 3) return "Third Term";
  return term ? `Term ${term}` : "";
}

function sexLabel(value: unknown) {
  const text = `${value ?? ""}`.trim().toLowerCase();
  if (["male", "m", "masculin"].includes(text)) return "Male";
  if (["female", "f", "feminin", "féminin"].includes(text)) return "Female";
  return clean(value);
}

function cycleLabel(value: unknown) {
  const text = `${value ?? ""}`.trim().toLowerCase();
  if (text.startsWith("first")) return "First";
  if (text.startsWith("second")) return "Second";
  return clean(value);
}

function ordinal(n: unknown) {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = value % 100;
  return `${value}${s[(v - 20) % 10] || s[v] || s[0]}`;
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

function formatYear(value: unknown) {
  return clean(value).replace(/-/g, "/");
}

// Sequence columns, numbered globally across the year so a Term-2 card shows
// "Seq 3 / Seq 4" and the Third-Term (annual) card shows "Seq 1"…"Seq 6".
function buildSequenceColumns(report: any) {
  const seqs = Array.isArray(report?.sequence?.sequences) ? report.sequence.sequences : [];
  if (seqs.length) {
    const sorted = [...seqs].sort(
      (a: any, b: any) => (Number(a.term) - Number(b.term)) || String(a.name).localeCompare(String(b.name))
    );
    const perTerm: Record<number, number> = {};
    return sorted.map((s: any) => {
      const term = Number(s.term) || 1;
      perTerm[term] = (perTerm[term] || 0) + 1;
      const globalNum = (term - 1) * 2 + perTerm[term];
      return { id: String(s.id), label: `Seq ${globalNum}` };
    });
  }
  const single = report?.sequence;
  if (single?.id) return [{ id: String(single.id), label: "Seq 1" }];
  return [{ id: "single", label: "Seq 1" }];
}

function getSubjectRows(report: any, columns: { id: string; label: string }[]) {
  const rows = Array.isArray(report?.subjects)
    ? report.subjects
    : Array.isArray(report?.grades)
      ? report.grades
      : [];
  return rows.map((row: any, index: number) => {
    const subjectName = clean(row.subject_name || row.name || row.subject?.name, "Subject");
    const average = asNumber(row.average ?? row.score ?? row.mark);
    const coefficient = asNumber(row.coefficient ?? row.coef ?? row.subject?.coefficient, 1);
    const seqScores: Record<string, number> = {};
    (Array.isArray(row.sequence_scores) ? row.sequence_scores : []).forEach((item: any) => {
      if (item?.sequence_id != null) seqScores[String(item.sequence_id)] = asNumber(item.score);
    });
    const values = columns.map((col) => {
      if (col.id === "single") return average;
      return seqScores[col.id] ?? null;
    });
    return {
      key: row.subject_id || `${subjectName}-${index}`,
      subjectName,
      teacherName: clean(row.teacher_name || row.teacherName || row.teacher?.name || row.teacher),
      coefficient,
      values,
      average,
      position: row.position != null ? Number(row.position) : null,
      coefAvg: asNumber(row.total, average * coefficient),
      remark: clean(row.remark),
    };
  });
}

function normalizeReport(report: any, options: ReportCardBuildOptions) {
  const reportStudent = report?.student || {};
  const student = { ...reportStudent, ...(options.student || {}) };
  const school = { ...(student.school || {}), ...(report?.school || {}), ...(options.school || {}) };
  const attendance = options.attendance || report?.attendance || {};
  const sequence = report?.sequence || {};

  const columns = buildSequenceColumns(report);
  const rows = getSubjectRows({ ...report, student }, columns);

  const totalCoef = rows.reduce((s, r) => s + r.coefficient, 0);
  const totalPoints = rows.reduce((s, r) => s + r.coefAvg, 0);
  const generalAverage = asNumber(report?.average, totalCoef ? totalPoints / totalCoef : 0);
  const term = Number(sequence.term || report?.term || 0);
  const isAnnual = term === 3 || columns.length > 2;

  const photo = resolveMediaUrl(clean(getNested(student, ["photo", "avatar", "user.avatar"])));
  const logo = resolveMediaUrl(clean(getNested(school, ["logo", "logo_url", "emblem"])));

  return {
    title: options.title || "Report Card",
    navy: NAVY,
    school,
    schoolName: clean(school.name || school.school_name, "SCHOOL NAME"),
    logo,
    region: clean(school.region),
    division: clean(school.division || school.department),
    poBox: clean(school.postal_code || school.address || school.location),
    academicYear: formatYear(sequence.academic_year || report?.academic_year || school.academic_year),
    termName: termName(term),
    columns,
    rows,
    student: {
      name: clean(student.name || student.full_name, ""),
      cycle: cycleLabel(student.cycle || student.school_class?.cycle),
      matricule: clean(student.matricule || student.user?.matricule),
      dob: formatDate(student.date_of_birth),
      sex: sexLabel(student.sex || student.gender),
      className: clean(student.class || student.student_class || student.class_name),
      photo,
    },
    enrollment: clean(report?.enrollment ?? report?.total_students, ""),
    classPosition: ordinal(report?.class_position ?? report?.rank),
    classMaster: clean(report?.class_master || student.class_master),
    principal: clean(school.principal),
    totalCoef,
    totalPoints,
    generalAverage,
    honorRoll: Boolean(report?.honor_roll ?? report?.honour_roll),
    isAnnual,
    promotionStatus: clean(report?.promotion_status || (report?.is_promoted ? "Promoted" : "")),
    classHighest: clean(report?.max_average),
    classAverage: clean(report?.class_average),
    classLowest: clean(report?.min_average),
    totalStudents: clean(report?.total_students),
    daysPresent: clean(attendance.present ?? attendance.present_days ?? attendance.days_present),
    daysAbsent: clean(attendance.absent ?? attendance.absent_days ?? attendance.days_absent),
    lateComing: clean(attendance.late ?? attendance.late_coming),
    conductGrade: clean(report?.conduct || attendance.conduct || attendance.conduct_remark, "Excellent"),
    principalRemark: clean(report?.principal_remark || report?.principals_remark),
    qrCode: clean(options.qrCode || report?.qr_code || report?.verification_qr),
    verifyUrl: clean(options.verifyUrl || report?.verify_url),
  };
}

export function buildCameroonReportCardHtml(report: any, options: ReportCardBuildOptions = {}) {
  const d = normalizeReport(report, options);
  const totalColumns = 3 + d.columns.length + 4; // Subject,Teacher,Coef + seqs + Avg,Position,Coef×Avg,Remark

  const seqHeaders = d.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const bodyRows = d.rows.length
    ? d.rows
        .map(
          (r) => `
      <tr>
        <td class="left">${escapeHtml(r.subjectName)}</td>
        <td class="left">${escapeHtml(r.teacherName)}</td>
        <td>${escapeHtml(r.coefficient)}</td>
        ${r.values.map((v) => `<td>${v === null || v === undefined ? "" : escapeHtml(asNumber(v).toFixed(0))}</td>`).join("")}
        <td>${escapeHtml(r.average.toFixed(1))}</td>
        <td>${r.position ? escapeHtml(r.position) : ""}</td>
        <td>${escapeHtml(r.coefAvg.toFixed(1))}</td>
        <td>${escapeHtml(r.remark)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="${totalColumns}" class="empty">No marks have been published for this report-card period.</td></tr>`;

  const statusBox = d.isAnnual && d.promotionStatus
    ? `<div class="stat highlight"><div class="stat-l">STATUS</div><div class="stat-v">${escapeHtml(d.promotionStatus.toUpperCase())}</div></div>`
    : "";

  const qrBox = d.qrCode
    ? `<img src="${escapeHtml(d.qrCode)}" alt="Verification QR" class="qr-img" />`
    : `<div class="qr-ph">QR</div>`;

  return `
    <style>
      @page{size:A4 portrait;margin:8mm}
      .rc-wrap{width:100%;overflow-x:auto;padding:8px;background:#eef1f4}
      .rc{box-sizing:border-box;width:794px;margin:0 auto;background:#fff;color:#111827;padding:20px 26px 22px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3}
      .rc *{box-sizing:border-box}
      .rc-head{display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;align-items:start;text-align:center}
      .rc-head .side{font-size:10px;line-height:1.5;color:#1f2937}
      .rc-head .side b{display:block;font-size:11px;color:${NAVY};letter-spacing:.3px}
      .rc-logo{width:78px;height:78px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;color:${NAVY};font-weight:800;font-size:11px}
      .rc-logo img{width:100%;height:100%;object-fit:contain}
      .rc-school{text-align:center;font-weight:800;font-size:16px;color:#111827;margin:10px 0 2px;letter-spacing:.3px}
      .rc-year{text-align:center;font-size:11px;font-weight:700;color:#374151;margin-bottom:8px}
      .rc-badge{display:block;width:fit-content;margin:0 auto 4px;background:${NAVY};color:#fff;font-weight:800;letter-spacing:.5px;padding:6px 20px;border-radius:6px;font-size:12px}
      .rc-rule{height:3px;background:${NAVY};margin:8px 0 12px;border-radius:2px}
      .rc-info{display:grid;grid-template-columns:110px 1fr 1fr;gap:14px;border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:12px}
      .rc-photo{border:1px solid #cbd5e1;border-radius:8px;background:#f1f5f9;height:120px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;overflow:hidden}
      .rc-photo img{width:100%;height:100%;object-fit:cover}
      .kv{display:grid;grid-template-columns:1fr 1fr;gap:4px 6px;align-content:start}
      .kv .k{color:#6b7280}
      .kv .v{font-weight:800;color:#111827;text-align:right}
      .rc-bar{background:${NAVY};color:#fff;font-weight:800;letter-spacing:.4px;padding:5px 12px;border-radius:5px;font-size:11px;margin-bottom:6px}
      table.rc-tbl{width:100%;border-collapse:collapse;font-size:10.5px;text-align:center}
      table.rc-tbl th{background:${NAVY};color:#fff;border:1px solid #2c4c72;padding:6px 4px;font-weight:700}
      table.rc-tbl td{border:1px solid #d7dee7;padding:5px 4px;color:#1f2937;height:22px}
      table.rc-tbl td.left{text-align:left;padding-left:8px}
      table.rc-tbl tr:nth-child(even) td{background:#f6f8fb}
      .empty{color:#6b7280;font-weight:600;padding:16px!important}
      .rc-stats{display:flex;gap:10px;margin:12px 0}
      .stat{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px 6px;text-align:center}
      .stat-l{font-size:9px;font-weight:800;letter-spacing:.5px;color:#6b7280;text-transform:uppercase}
      .stat-v{font-size:15px;font-weight:800;color:#111827;margin-top:3px}
      .stat.highlight{background:${NAVY}0d;border-color:${NAVY}}
      .stat.highlight .stat-v{color:${NAVY}}
      .rc-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
      .panel{border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
      .panel h4{margin:0;background:#f1f5f9;color:#374151;text-align:center;font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:6px}
      .panel .row{display:flex;justify-content:space-between;padding:6px 12px;border-top:1px solid #eef2f6;font-size:11px}
      .panel .row span:first-child{color:#6b7280}
      .panel .row span:last-child{font-weight:800;color:#111827}
      .rc-remark{display:grid;grid-template-columns:1fr 92px;gap:12px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;margin-bottom:16px}
      .rc-remark .body{padding:8px 12px}
      .rc-remark .title{font-size:10px;font-weight:800;letter-spacing:.5px;color:#374151;text-transform:uppercase;border-bottom:1px solid #eef2f6;padding-bottom:5px;margin-bottom:6px;text-align:center}
      .rc-remark .txt{font-style:italic;color:#1f2937;font-size:11px;min-height:34px}
      .rc-qr{border-left:1px solid #eef2f6;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;text-align:center}
      .qr-img{width:60px;height:60px;object-fit:contain}
      .qr-ph{width:56px;height:56px;border:1px dashed #94a3b8;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-weight:800}
      .rc-qr .cap{font-size:8px;font-weight:800;color:#6b7280;margin-top:4px;letter-spacing:.3px}
      .rc-sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding:6px 8px 0;text-align:center}
      .rc-sign .line{border-top:1px solid #94a3b8;padding-top:5px;font-size:10px;color:#374151;font-weight:700}
      @media print{html,body{background:#fff!important}.rc-wrap{padding:0;background:#fff;overflow:visible}.rc{width:100%;box-shadow:none;page-break-after:always}}
    </style>
    <div class="rc-wrap">
      <section class="rc">
        <header class="rc-head">
          <div class="side">
            <b>REPUBLIC OF CAMEROON</b>
            Peace - Work - Fatherland<br />
            Ministry of Secondary Education<br />
            ${escapeHtml(d.region)}<br />
            ${escapeHtml(d.division)}<br />
            ${d.poBox ? `P.O Box: ${escapeHtml(d.poBox)}` : ""}
          </div>
          <div class="rc-logo">${d.logo ? `<img src="${escapeHtml(d.logo)}" alt="logo" />` : "LOGO"}</div>
          <div class="side">
            <b>RÉPUBLIQUE DU CAMEROUN</b>
            Paix - Travail - Patrie<br />
            Ministère des Enseignements Secondaires<br />
            ${d.region ? `Région: ${escapeHtml(d.region)}` : ""}<br />
            ${d.division ? `Département: ${escapeHtml(d.division)}` : ""}<br />
            ${d.poBox ? `B.P: ${escapeHtml(d.poBox)}` : ""}
          </div>
        </header>

        <div class="rc-school">${escapeHtml(d.schoolName)}</div>
        <div class="rc-year">Academic Year: ${escapeHtml(d.academicYear)}</div>
        <div class="rc-badge">${escapeHtml((d.termName || "").toUpperCase())} REPORT CARD</div>
        <div class="rc-rule"></div>

        <div class="rc-info">
          <div class="rc-photo">${d.student.photo ? `<img src="${escapeHtml(d.student.photo)}" alt="photo" />` : "Profile Image"}</div>
          <div class="kv">
            <span class="k">Name</span><span class="v">${escapeHtml(d.student.name)}</span>
            <span class="k">Cycle</span><span class="v">${escapeHtml(d.student.cycle)}</span>
            <span class="k">Matricule</span><span class="v">${escapeHtml(d.student.matricule)}</span>
            <span class="k">Date of Birth</span><span class="v">${escapeHtml(d.student.dob)}</span>
            <span class="k">Sex</span><span class="v">${escapeHtml(d.student.sex)}</span>
          </div>
          <div class="kv">
            <span class="k">Class</span><span class="v">${escapeHtml(d.student.className)}</span>
            <span class="k">Enrollment</span><span class="v">${escapeHtml(d.enrollment)}</span>
            <span class="k">Class Position</span><span class="v">${escapeHtml(d.classPosition)}</span>
            <span class="k">Class Master</span><span class="v">${escapeHtml(d.classMaster)}</span>
            <span class="k">Principal</span><span class="v">${escapeHtml(d.principal)}</span>
          </div>
        </div>

        <div class="rc-bar">ACADEMIC PERFORMANCE</div>
        <table class="rc-tbl">
          <thead>
            <tr>
              <th class="left">Subject</th>
              <th>Teacher</th>
              <th>Coef</th>
              ${seqHeaders}
              <th>Average</th>
              <th>Position</th>
              <th>Coef × Avg</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>

        <div class="rc-stats">
          <div class="stat"><div class="stat-l">Total Coef</div><div class="stat-v">${escapeHtml(d.totalCoef)}</div></div>
          <div class="stat"><div class="stat-l">Total Points</div><div class="stat-v">${escapeHtml(d.totalPoints.toFixed(1))}</div></div>
          <div class="stat"><div class="stat-l">General Average</div><div class="stat-v">${escapeHtml(d.generalAverage.toFixed(2))} / 20</div></div>
          <div class="stat"><div class="stat-l">Honor Roll</div><div class="stat-v">${d.honorRoll ? "YES" : "NO"}</div></div>
          ${statusBox}
        </div>

        <div class="rc-two">
          <div class="panel">
            <h4>Class Performance</h4>
            <div class="row"><span>Highest Average</span><span>${escapeHtml(d.classHighest)}</span></div>
            <div class="row"><span>Class Average</span><span>${escapeHtml(d.classAverage)}</span></div>
            <div class="row"><span>Lowest Average</span><span>${escapeHtml(d.classLowest)}</span></div>
            <div class="row"><span>Total Students</span><span>${escapeHtml(d.totalStudents)}</span></div>
          </div>
          <div class="panel">
            <h4>Conduct &amp; Attendance</h4>
            <div class="row"><span>Days Present</span><span>${escapeHtml(d.daysPresent)}</span></div>
            <div class="row"><span>Days Absent</span><span>${escapeHtml(d.daysAbsent)}</span></div>
            <div class="row"><span>Late Coming</span><span>${escapeHtml(d.lateComing)}</span></div>
            <div class="row"><span>Conduct Grade</span><span>${escapeHtml(d.conductGrade)}</span></div>
          </div>
        </div>

        <div class="rc-remark">
          <div class="body">
            <div class="title">Principal's Remark</div>
            <div class="txt">${escapeHtml(d.principalRemark)}</div>
          </div>
          <div class="rc-qr">${qrBox}<div class="cap">SCAN TO<br />VERIFY</div></div>
        </div>

        <div class="rc-sign">
          <div class="line">Parent / Guardian</div>
          <div class="line">Class Master</div>
          <div class="line">Principal</div>
        </div>
      </section>
    </div>
  `;
}

export function buildCameroonReportCardDocument(report: any, options: ReportCardBuildOptions = {}) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(options.title || "Report Card")}</title>
      </head>
      <body style="margin:0;background:#eef1f4;">
        ${buildCameroonReportCardHtml(report, options)}
      </body>
    </html>`;
}
