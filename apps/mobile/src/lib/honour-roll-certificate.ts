import { resolveMediaUrl } from "@/lib/media";

/**
 * Official Honour Roll "Certificate of Excellence".
 *
 * Renders the exact certificate design used across web, desktop and mobile —
 * landscape A4, navy double border with gold inner frame, bilingual Cameroon
 * header, school crest, student name, class/year/average statement, official
 * seal and Class Master / Principal signatures. The same HTML is shown on
 * screen and rendered into the downloaded PDF so the document never changes
 * between accounts or after download.
 */

type CertificateEntry = {
  name?: string;
  class_name?: string;
  className?: string;
  academic_year?: string;
  academicYear?: string;
  average?: number | string;
  term_label?: string;
  termLabel?: string;
  class_master?: string;
  principal?: string;
};

const NAVY = "#17385a";
const GOLD = "#c9a227";

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

export function buildHonourRollCertificateHtml(entry: CertificateEntry, school: any) {
  const schoolName = clean(school?.name, "SCHOOL NAME");
  const motto = clean(school?.motto);
  const logo = resolveMediaUrl(clean(school?.logo || school?.logo_url));
  const name = clean(entry?.name, "Student");
  const className = clean(entry?.class_name || entry?.className, "—");
  const year = clean(entry?.academic_year || entry?.academicYear, "—");
  const termLabel = clean(entry?.term_label || entry?.termLabel);
  const average = Number(entry?.average ?? 0).toFixed(2);
  const classMaster = clean(entry?.class_master || school?.class_master, "Class Master");
  const principal = clean(entry?.principal || school?.principal, "Principal");
  const period = termLabel ? `${escapeHtml(termLabel)}, ${escapeHtml(className)}` : escapeHtml(className);

  return `
    <style>
      .cert-wrap{width:100%;overflow-x:auto;background:#eef1f4;padding:8px}
      .cert{box-sizing:border-box;width:1123px;height:794px;margin:0 auto;background:#fff;position:relative;
        border:10px solid ${NAVY};font-family:Georgia,'Times New Roman',serif;color:#1f2937}
      .cert *{box-sizing:border-box}
      .cert-inner{position:absolute;inset:8px;border:2px solid ${GOLD};padding:34px 56px 28px;display:flex;flex-direction:column;align-items:center}
      .cert-head{display:grid;grid-template-columns:1fr 120px 1fr;gap:10px;width:100%;align-items:center;text-align:center}
      .cert-head .side{font-size:12.5px;line-height:1.55;color:#1f2937}
      .cert-head .side b{display:block;font-size:13px;color:#111827;letter-spacing:.4px}
      .cert-logo{width:88px;height:88px;border-radius:50%;border:2px solid ${NAVY};margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;color:${NAVY};font-weight:700;font-size:13px;letter-spacing:1px}
      .cert-logo img{width:100%;height:100%;object-fit:contain}
      .cert-school{margin-top:16px;font-weight:700;font-size:24px;color:${NAVY};letter-spacing:.6px;text-transform:uppercase;text-align:center}
      .cert-motto{font-style:italic;font-size:13.5px;color:#4b5563;margin-top:4px;text-align:center}
      .cert-rule{width:82%;height:2px;background:${GOLD};margin:16px auto 22px}
      .cert-title{font-size:46px;font-weight:700;color:${NAVY};letter-spacing:2px;text-transform:uppercase;text-align:center}
      .cert-sub{font-size:24px;font-style:italic;color:${GOLD};margin-top:6px;text-align:center}
      .cert-certify{margin-top:26px;font-size:17px;color:#374151;font-family:Arial,Helvetica,sans-serif;text-align:center}
      .cert-name{margin-top:12px;font-size:44px;font-weight:700;color:${NAVY};text-align:center;padding:0 40px 10px;border-bottom:2px solid #d1d5db}
      .cert-body{margin-top:24px;font-size:17.5px;line-height:1.7;color:#374151;text-align:center;max-width:820px;font-family:Arial,Helvetica,sans-serif}
      .cert-body b.navy{color:${NAVY}}
      .cert-body b.gold{color:${GOLD}}
      .cert-foot{margin-top:auto;width:100%;display:grid;grid-template-columns:1fr 170px 1fr;align-items:end;gap:16px}
      .cert-sign{text-align:center;font-family:Arial,Helvetica,sans-serif}
      .cert-sign .line{border-top:1.5px solid #6b7280;margin:0 24px 8px}
      .cert-sign .who{font-weight:700;font-size:15.5px;color:#111827}
      .cert-sign .role{font-size:13px;color:#6b7280;margin-top:2px}
      .cert-seal{width:118px;height:118px;border-radius:50%;border:5px solid ${GOLD};margin:0 auto;display:flex;align-items:center;justify-content:center;background:#fff}
      .cert-seal .in{width:92px;height:92px;border-radius:50%;border:2px dashed ${NAVY};display:flex;align-items:center;justify-content:center;text-align:center;color:${NAVY};font-weight:700;font-size:10.5px;letter-spacing:.6px;line-height:1.5;font-family:Arial,Helvetica,sans-serif}
      @media print{html,body{background:#fff!important}.cert-wrap{padding:0;background:#fff;overflow:visible}}
    </style>
    <div class="cert-wrap">
      <section class="cert">
        <div class="cert-inner">
          <header class="cert-head">
            <div class="side">
              <b>REPUBLIC OF CAMEROON</b>
              Peace - Work - Fatherland<br />
              Ministry of Secondary Education
            </div>
            <div class="cert-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="logo" />` : "LOGO"}</div>
            <div class="side">
              <b>REPUBLIQUE DU CAMEROUN</b>
              Paix - Travail - Patrie<br />
              Ministère des Enseignements Secondaires
            </div>
          </header>

          <div class="cert-school">${escapeHtml(schoolName)}</div>
          ${motto ? `<div class="cert-motto">&quot;${escapeHtml(motto)}&quot;</div>` : ""}
          <div class="cert-rule"></div>

          <div class="cert-title">Certificate of Excellence</div>
          <div class="cert-sub">Honor Roll</div>

          <div class="cert-certify">This is to certify that</div>
          <div class="cert-name">${escapeHtml(name)}</div>

          <div class="cert-body">
            Has achieved outstanding academic performance and is hereby placed on the
            Honor Roll for the <b class="navy">${period}</b> of the <b class="navy">${escapeHtml(year)}</b> academic
            year, with a remarkable general average of <b class="gold">${escapeHtml(average)}/20</b>.
          </div>

          <div class="cert-foot">
            <div class="cert-sign">
              <div class="line"></div>
              <div class="who">${escapeHtml(classMaster)}</div>
              <div class="role">Class Master</div>
            </div>
            <div class="cert-seal"><div class="in">OFFICIAL<br/>SEAL OF<br/>EXCELLENCE</div></div>
            <div class="cert-sign">
              <div class="line"></div>
              <div class="who">${escapeHtml(principal)}</div>
              <div class="role">Principal</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

export default buildHonourRollCertificateHtml;
