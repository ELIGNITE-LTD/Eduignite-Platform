"use client";

/**
 * Official Cameroon secondary-school Student ID card (CARTE D'ÉLÈVE).
 *
 * Renders a professional, fully bilingual (French/English) front + back at the
 * CR80 card ratio (450 × 284 px ≈ 85.6 × 54 mm). The card is valid for exactly
 * one year from its issue date; regenerating always stamps the student's
 * current class/level and the current academic year with a fresh 1-year window.
 */

import { QrCode } from "lucide-react";

export interface IdCardStudent {
  name: string;
  matricule: string;
  className: string;
  section?: string;
  dob?: string;
  placeOfBirth?: string;
  gender?: string;
  admissionNumber?: string;
  avatar?: string;
  qrCode?: string;
  guardian?: string;
  guardianPhone?: string;
}

export interface IdCardSchool {
  name: string;
  motto?: string;
  logo?: string;
  address?: string;
  phone?: string;
  principal?: string;
  ministry?: string;
}

export interface IdCardPlatform {
  name?: string;
  logo?: string;
}

export function computeAcademicYear(d = new Date()): string {
  const y = d.getFullYear();
  // Cameroon academic year starts in September (month index 8).
  return d.getMonth() >= 8 ? `${y} – ${y + 1}` : `${y - 1} – ${y}`;
}

export function addOneYear(d: Date): Date {
  const n = new Date(d);
  n.setFullYear(n.getFullYear() + 1);
  n.setDate(n.getDate() - 1); // valid through the day before the anniversary
  return n;
}

function formatLongDate(value?: string | Date): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function formatGender(g?: string): string {
  const v = (g || "").toLowerCase();
  if (v.startsWith("m")) return "Masculin / Male";
  if (v.startsWith("f")) return "Féminin / Female";
  return "—";
}

function Field({ fr, en, value, mono }: { fr: string; en: string; value?: string; mono?: boolean }) {
  return (
    <div className="space-y-[1px]">
      <p className="text-[6px] font-black uppercase leading-none tracking-[0.12em] text-slate-500">
        {fr} <span className="text-slate-400">/ {en}</span>
      </p>
      <p className={`truncate text-[10px] font-black leading-tight text-[#0b2a5b] ${mono ? "font-mono" : ""}`}>
        {value && value.trim() ? value : "—"}
      </p>
    </div>
  );
}

const NATIONAL = { green: "#0a7a3f", red: "#ce1126", yellow: "#fcd116", navy: "#0b2a5b" };

function FlagStripe({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-3 overflow-hidden rounded-[2px] ${className}`} aria-hidden>
      <span className="w-2" style={{ background: NATIONAL.green }} />
      <span className="flex w-2 items-center justify-center" style={{ background: NATIONAL.red }}>
        <span className="text-[7px] leading-none" style={{ color: NATIONAL.yellow }}>★</span>
      </span>
      <span className="w-2" style={{ background: NATIONAL.yellow }} />
    </span>
  );
}

export function StudentIdCard({
  student,
  school,
  platform,
  issueDate,
}: {
  student: IdCardStudent;
  school: IdCardSchool;
  platform?: IdCardPlatform;
  issueDate?: Date;
}) {
  const issued = issueDate ?? new Date();
  const expires = addOneYear(issued);
  const academicYear = computeAcademicYear(issued);
  const expired = new Date() > expires;
  const ministry = school.ministry || "Ministry of Secondary Education / Ministère des Enseignements Secondaires";
  const schoolName = school.name || "SCHOOL NAME";
  const terms = `This card is strictly personal and non-transferable. Any loss must be reported immediately to the administration of ${schoolName}. If found, kindly return it to ${schoolName}.`;
  const termsFr = `Cette carte est strictement personnelle et incessible. Toute perte doit être signalée immédiatement à l'administration de ${schoolName}. En cas de découverte, veuillez la retourner à ${schoolName}.`;

  return (
    <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start print:block print:gap-0">
      {/* ============================= FRONT ============================= */}
      <div className="flex flex-col items-center print:break-after-page print:[zoom:0.78]">
        <div data-idcard-side="front" data-idcard-name={student.name} className="relative h-[284px] w-[450px] overflow-hidden rounded-2xl border border-slate-300 bg-white font-sans shadow-xl print:shadow-none">
          {/* National header */}
          <div className="px-3 py-1.5 text-center text-white" style={{ background: NATIONAL.navy }}>
            <div className="flex items-center justify-center gap-2">
              <FlagStripe />
              <div className="leading-none">
                <p className="text-[7.5px] font-black uppercase tracking-[0.08em]">
                  Republic of Cameroon / République du Cameroun
                </p>
                <p className="text-[6.5px] font-semibold uppercase tracking-[0.1em] text-white/80">
                  Peace – Work – Fatherland / Paix – Travail – Patrie
                </p>
              </div>
              <FlagStripe />
            </div>
            <p className="mt-0.5 text-[6px] font-bold uppercase leading-none tracking-[0.06em] text-white/70">
              {ministry}
            </p>
          </div>

          {/* School row */}
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
              {school.logo ? (
                <img src={school.logo} alt="" className="h-full w-full object-contain p-0.5" />
              ) : (
                <span className="text-[8px] font-black text-slate-300">LOGO</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[12px] font-black uppercase leading-tight text-[#0b2a5b]">{schoolName}</h3>
              {school.motto ? (
                <p className="truncate text-[7px] font-semibold italic text-slate-500">“{school.motto}”</p>
              ) : null}
            </div>
            <div
              className="shrink-0 rounded px-2 py-1 text-center text-[7px] font-black uppercase leading-tight tracking-[0.08em] text-white"
              style={{ background: NATIONAL.red }}
            >
              Carte d'Élève
              <br />
              Student ID Card
            </div>
          </div>

          {/* Body */}
          <div className="flex gap-3 px-3 py-2">
            <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
              <div className="col-span-2">
                <Field fr="Nom" en="Name" value={student.name?.toUpperCase()} />
              </div>
              <Field fr="Matricule" en="Reg. No." value={student.matricule} mono />
              <Field fr="Classe" en="Class" value={student.className} />
              <Field fr="Né(e) le" en="Born on" value={formatLongDate(student.dob)} />
              <Field fr="À" en="Place of Birth" value={student.placeOfBirth} />
              <Field fr="Sexe" en="Gender" value={formatGender(student.gender)} />
              <Field fr="N° d'Admission" en="Admission No." value={student.admissionNumber} mono />
              <Field fr="Section" en="Filière" value={student.section} />
              <Field fr="Année Académique" en="Academic Year" value={academicYear} />
            </div>

            {/* Photo + signature */}
            <div className="flex w-[92px] shrink-0 flex-col items-center">
              <div className="h-[104px] w-[84px] overflow-hidden rounded-md border-2 border-[#0b2a5b]/15 bg-slate-100">
                {student.avatar ? (
                  <img src={student.avatar} alt={student.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[7px] font-bold uppercase text-slate-400">
                    Photo
                  </div>
                )}
              </div>
              <div className="mt-2 w-full text-center">
                <div className="mx-auto h-4 border-b border-slate-300" />
                <p className="mt-0.5 text-[6px] font-black uppercase leading-none tracking-[0.08em] text-slate-500">
                  Signature du Principal / Principal's Signature
                </p>
                <p className="truncate text-[8px] font-black text-[#0b2a5b]">
                  Principal: {school.principal || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Validity footer */}
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-white"
            style={{ background: NATIONAL.navy }}
          >
            <span>Issued: {formatLongDate(issued)}</span>
            <span className={expired ? "rounded bg-red-500 px-1.5 py-0.5" : ""}>
              {expired ? "Expired" : `Valid until: ${formatLongDate(expires)}`}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 no-print">Front / Recto</p>
      </div>

      {/* ============================= BACK ============================= */}
      <div className="flex flex-col items-center print:break-after-page print:[zoom:0.78]">
        <div data-idcard-side="back" data-idcard-name={student.name} className="relative flex h-[284px] w-[450px] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white font-sans shadow-xl print:shadow-none">
          <div className="h-1.5 w-full" style={{ background: NATIONAL.navy }} />

          <div className="flex gap-3 px-4 pt-3">
            {/* QR */}
            <div className="flex w-[110px] shrink-0 flex-col items-center">
              <div className="flex h-[92px] w-[92px] items-center justify-center rounded-lg border-2 border-slate-200 bg-white p-1">
                {student.qrCode ? (
                  <img src={student.qrCode} alt={`Verify ${student.name}`} className="h-full w-full object-contain" />
                ) : (
                  <QrCode className="h-16 w-16 text-slate-300" />
                )}
              </div>
              <p className="mt-1 text-center text-[6.5px] font-black uppercase leading-tight tracking-[0.08em] text-slate-500">
                Scanner pour vérifier
                <br />
                Scan to Verify Identity
              </p>
            </div>

            {/* Contacts */}
            <div className="min-w-0 flex-1 space-y-2 border-l border-slate-200 pl-3">
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.1em] text-[#0b2a5b]">
                  Contact d'Urgence / Emergency Contact
                </p>
                <div className="mt-1 space-y-1">
                  <Field fr="Parent/Tuteur" en="Parent/Guardian" value={student.guardian} />
                  <Field fr="Téléphone" en="Telephone" value={student.guardianPhone} mono />
                </div>
              </div>
              <div>
                <Field fr="Adresse de l'Établissement" en="School Address" value={school.address} />
                <div className="mt-1">
                  <Field fr="Téléphone" en="Telephone" value={school.phone} mono />
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="mt-2 flex-1 border-t border-slate-200 px-4 py-2">
            <p className="text-[6.5px] font-black uppercase tracking-[0.1em] text-[#0b2a5b]">
              Conditions d'Utilisation / Terms and Conditions
            </p>
            <p className="mt-0.5 text-[6.5px] leading-[1.35] text-slate-600">{terms}</p>
            <p className="mt-1 text-[6.5px] italic leading-[1.35] text-slate-500">{termsFr}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-1">
            <span className="text-[6px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Année Académique / Academic Year: {academicYear}
            </span>
            <span className="text-[6px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Valid until: {formatLongDate(expires)}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 no-print">Back / Verso</p>
      </div>
    </div>
  );
}
