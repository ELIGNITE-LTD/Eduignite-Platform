import { BadgeCheck, MessageCircle, ShieldQuestion } from "lucide-react";

import type { PublicSchool, SchoolLang } from "@/lib/public-schools";
import { ACCREDITATION_LABELS, MINESUP_URL, accreditationState, buildWhatsAppLink } from "@/lib/school-site-extras";

/**
 * WhatsApp call to action, Mobile Money instructions (display only) and the
 * MINESUP accreditation badge of a higher-education site. Each renders nothing
 * when the institution has not provided the data.
 */

const T = {
  en: {
    chat: "Chat on WhatsApp",
    payTitle: "Pay the application fee",
    payLead: "Send the application fee by mobile money, then keep the transaction receipt.",
    mtn: "MTN MoMo",
    orange: "Orange Money",
    note: "Note",
    payDisclaimer: "Payments are made directly to the institution. EduIgnite does not process them.",
    verified: "Verified accreditation",
    ref: "ref",
    check: "Check on MINESUP",
    declared: "Accreditation declared by the institution",
  },
  fr: {
    chat: "Discuter sur WhatsApp",
    payTitle: "Payer les frais de dossier",
    payLead: "Envoyez les frais de dossier par mobile money, puis conservez le recu de la transaction.",
    mtn: "MTN MoMo",
    orange: "Orange Money",
    note: "Note",
    payDisclaimer: "Les paiements sont faits directement a l'etablissement. EduIgnite ne les traite pas.",
    verified: "Accreditation verifiee",
    ref: "ref",
    check: "Verifier sur le MINESUP",
    declared: "Accreditation declaree par l'etablissement",
  },
} as const;

/** "237670000000" -> "+237 670 000 000" for reading; the digits stay the source of truth. */
function pretty(digits: string): string {
  return digits.startsWith("237") && digits.length === 12
    ? `+237 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
    : `+${digits}`;
}

export function WhatsAppButton({ school, lang, className = "" }: { school: PublicSchool; lang: SchoolLang; className?: string }) {
  const link = buildWhatsAppLink(school.whatsapp_number, school.name, lang);
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={`he-btn he-btn-whatsapp ${className}`.trim()}
    >
      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
      {T[lang].chat}
    </a>
  );
}

export function PaymentInstructions({ school, lang, tone = "light" }: { school: PublicSchool; lang: SchoolLang; tone?: "light" | "dark" }) {
  const t = T[lang];
  const rows = [
    { label: t.mtn, number: school.momo_number },
    { label: t.orange, number: school.orange_money_number },
  ].filter((r) => r.number);
  if (rows.length === 0) return null;
  const dark = tone === "dark";
  return (
    <section
      aria-labelledby="pay-fee"
      className={`border p-5 sm:p-6 ${dark ? "border-white/20 bg-white/5 text-white" : "border-[var(--he-line,#e2e8f0)] bg-white text-slate-800"}`}
      style={{ borderRadius: 3 }}
    >
      <h2 id="pay-fee" className="he-serif text-xl font-semibold">{t.payTitle}</h2>
      <p className={`mt-2 text-sm ${dark ? "text-[#c3cbd8]" : "text-slate-600"}`}>{t.payLead}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className={`border px-4 py-3 ${dark ? "border-white/20" : "border-slate-200"}`} style={{ borderRadius: 2 }}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? "text-[#c3cbd8]" : "text-slate-500"}`}>{r.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{pretty(r.number)}</p>
          </li>
        ))}
      </ul>
      {school.payment_note ? (
        <p className="mt-4 text-sm"><span className="font-semibold">{t.note}:</span> {school.payment_note}</p>
      ) : null}
      <p className={`mt-3 text-xs ${dark ? "text-[#aab4c4]" : "text-slate-500"}`}>{t.payDisclaimer}</p>
    </section>
  );
}

/** "Verified" styling and wording are used only when the platform verified the accreditation. */
export function AccreditationBadge({ school, lang, tone = "light" }: { school: PublicSchool; lang: SchoolLang; tone?: "light" | "dark" }) {
  const a = school.accreditation;
  const state = accreditationState(a);
  if (state === "hidden") return null;
  const t = T[lang];
  const level = ACCREDITATION_LABELS[a.level][lang];
  const dark = tone === "dark";
  if (state === "verified") {
    return (
      <p
        data-accreditation="verified"
        className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 border px-3 py-2 text-sm font-medium ${dark ? "border-emerald-300/60 bg-emerald-400/10 text-emerald-100" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}
        style={{ borderRadius: 2 }}
      >
        <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
        <span>{t.verified}: {level}{a.reference ? ` (${t.ref} ${a.reference})` : ""}</span>
        <a href={MINESUP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t.check}</a>
      </p>
    );
  }
  return (
    <p
      data-accreditation="declared"
      className={`inline-flex flex-wrap items-center gap-2 border px-3 py-2 text-sm ${dark ? "border-white/25 text-[#c3cbd8]" : "border-slate-300 bg-slate-50 text-slate-600"}`}
      style={{ borderRadius: 2 }}
    >
      <ShieldQuestion className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t.declared}: {level}{a.reference ? ` (${t.ref} ${a.reference})` : ""}</span>
    </p>
  );
}
