import { resolveMediaUrl } from "@/lib/media";

/**
 * Printable pupil certificate (merit, attendance, good conduct, completion,
 * enrolment). Same landscape A4 design family as the Honour Roll certificate
 * and the same HTML is used for screen, print and PDF. Carries the school
 * header, the certificate number and Class Teacher / Principal signatures.
 */

export type CertificateLike = {
  number: string;
  kind: string;
  student_name: string;
  class_name: string;
  issued_on: string;
  academic_year?: string;
  remark?: string;
  issued_by_name?: string;
};

const NAVY = "#17385a";
const GOLD = "#c9a227";

const TITLES: Record<string, { en: string; fr: string }> = {
  merit: { en: "Certificate of Merit", fr: "Certificat de Mérite" },
  attendance: { en: "Certificate of Attendance", fr: "Certificat d'Assiduité" },
  conduct: { en: "Certificate of Good Conduct", fr: "Certificat de Bonne Conduite" },
  completion: { en: "Certificate of Completion", fr: "Certificat de Fin d'Études" },
  enrolment: { en: "Certificate of Enrolment", fr: "Certificat de Scolarité" },
};

const BODY: Record<string, { en: string; fr: string }> = {
  merit: { en: "has shown outstanding effort and achievement and is awarded this certificate of merit.", fr: "a fait preuve d'efforts et de résultats remarquables et reçoit ce certificat de mérite." },
  attendance: { en: "has been exemplary in attendance and punctuality.", fr: "s'est distingué(e) par son assiduité et sa ponctualité." },
  conduct: { en: "has shown excellent behaviour and respect towards others.", fr: "a montré un comportement exemplaire et du respect envers les autres." },
  completion: { en: "has successfully completed the course of study of this class.", fr: "a terminé avec succès le cycle d'études de cette classe." },
  enrolment: { en: "is a registered pupil of this school.", fr: "est un(e) élève régulièrement inscrit(e) dans cet établissement." },
};

export function certificateTitle(kind: string, fr = false) {
  const t = TITLES[kind] ?? TITLES.merit;
  return fr ? t.fr : t.en;
}

function esc(value: unknown) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function clean(value: unknown, fallback = "") {
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

export function buildPupilCertificateHtml(cert: CertificateLike, school: any, opts: { fr?: boolean } = {}) {
  const fr = Boolean(opts.fr);
  const schoolName = clean(school?.name, "SCHOOL");
  const motto = clean(school?.motto);
  const logo = resolveMediaUrl(clean(school?.logo || school?.logo_url));
  const principal = clean(school?.principal, fr ? "Directeur" : "Principal");
  const body = BODY[cert.kind] ?? BODY.merit;
  const year = clean(cert.academic_year);
  const date = clean(cert.issued_on);

  return `
    <style>
      .pc-wrap{width:100%;overflow-x:auto;background:#eef1f4;padding:8px}
      .pc{box-sizing:border-box;width:1123px;height:794px;margin:0 auto;background:#fff;position:relative;
        border:10px solid ${NAVY};font-family:Georgia,'Times New Roman',serif;color:#1f2937}
      .pc *{box-sizing:border-box}
      .pc-in{position:absolute;inset:8px;border:2px solid ${GOLD};padding:30px 56px 26px;display:flex;flex-direction:column;align-items:center}
      .pc-head{display:grid;grid-template-columns:1fr 110px 1fr;gap:10px;width:100%;align-items:center;text-align:center}
      .pc-head .side{font-size:12.5px;line-height:1.55}
      .pc-head .side b{display:block;font-size:13px;letter-spacing:.4px}
      .pc-logo{width:84px;height:84px;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .pc-logo img{width:100%;height:100%;object-fit:contain}
      .pc-school{margin-top:12px;font-weight:700;font-size:24px;color:${NAVY};letter-spacing:.6px;text-transform:uppercase;text-align:center}
      .pc-motto{font-style:italic;font-size:13.5px;color:#4b5563;margin-top:4px;text-align:center}
      .pc-rule{width:82%;height:2px;background:${GOLD};margin:14px auto 20px}
      .pc-title{font-size:44px;font-weight:700;color:${NAVY};letter-spacing:2px;text-transform:uppercase;text-align:center}
      .pc-certify{margin-top:22px;font-size:17px;color:#374151;font-family:Arial,Helvetica,sans-serif}
      .pc-name{margin-top:10px;font-size:42px;font-weight:700;color:${NAVY};text-align:center;padding:0 40px 8px;border-bottom:2px solid #d1d5db}
      .pc-class{margin-top:8px;font-size:16px;color:#6b7280;font-family:Arial,Helvetica,sans-serif}
      .pc-body{margin-top:18px;font-size:18px;line-height:1.7;color:#374151;text-align:center;max-width:820px;font-family:Arial,Helvetica,sans-serif}
      .pc-remark{margin-top:10px;font-style:italic;font-size:17px;color:${NAVY};text-align:center;max-width:820px}
      .pc-foot{margin-top:auto;width:100%;display:grid;grid-template-columns:1fr 200px 1fr;align-items:end;gap:16px}
      .pc-sign{text-align:center;font-family:Arial,Helvetica,sans-serif}
      .pc-sign .line{border-top:1.5px solid #6b7280;margin:0 24px 8px}
      .pc-sign .who{font-weight:700;font-size:15px;color:#111827}
      .pc-sign .role{font-size:13px;color:#6b7280;margin-top:2px}
      .pc-meta{text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;line-height:1.6}
      .pc-meta b{color:#111827}
      @media print{html,body{background:#fff!important}.pc-wrap{padding:0;background:#fff;overflow:visible}}
    </style>
    <div class="pc-wrap">
      <section class="pc">
        <div class="pc-in">
          <header class="pc-head">
            <div class="side"><b>REPUBLIC OF CAMEROON</b>Peace - Work - Fatherland<br />Ministry of Basic Education</div>
            ${logo ? `<div class="pc-logo"><img src="${esc(logo)}" alt="logo" /></div>` : "<div></div>"}
            <div class="side"><b>REPUBLIQUE DU CAMEROUN</b>Paix - Travail - Patrie<br />Ministère de l'Éducation de Base</div>
          </header>
          <div class="pc-school">${esc(schoolName)}</div>
          ${motto ? `<div class="pc-motto">&quot;${esc(motto)}&quot;</div>` : ""}
          <div class="pc-rule"></div>
          <div class="pc-title">${esc(certificateTitle(cert.kind, fr))}</div>
          <div class="pc-certify">${fr ? "Il est certifié que" : "This is to certify that"}</div>
          <div class="pc-name">${esc(clean(cert.student_name, "—"))}</div>
          <div class="pc-class">${esc(clean(cert.class_name))}${year ? ` · ${esc(year)}` : ""}</div>
          <div class="pc-body">${esc(fr ? body.fr : body.en)}</div>
          ${cert.remark ? `<div class="pc-remark">&quot;${esc(cert.remark)}&quot;</div>` : ""}
          <div class="pc-foot">
            <div class="pc-sign"><div class="line"></div><div class="who">${esc(clean(cert.issued_by_name, fr ? "Maître / Maîtresse" : "Class Teacher"))}</div><div class="role">${fr ? "Enseignant(e)" : "Class Teacher"}</div></div>
            <div class="pc-meta">${fr ? "N°" : "No."} <b>${esc(cert.number)}</b><br />${esc(date)}</div>
            <div class="pc-sign"><div class="line"></div><div class="who">${esc(principal)}</div><div class="role">${fr ? "Directeur / Directrice" : "Principal"}</div></div>
          </div>
        </div>
      </section>
    </div>
  `;
}
