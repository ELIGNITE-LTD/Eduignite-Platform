"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Printer, ShieldCheck } from "lucide-react";

/**
 * Full, printable view of a report card, shown on the public verification page
 * ONLY when the scanned QR carried the card's signed credential. The server
 * sends the exact figures that were printed; nothing is recomputed here.
 */

type Lang = "en" | "fr";

const T = {
  verified: { en: "Verified by EduIgnite", fr: "Vérifié par EduIgnite" },
  genuine: {
    en: "These are the exact results recorded when this report card was issued.",
    fr: "Ce sont les résultats exacts enregistrés lors de l'émission de ce bulletin.",
  },
  changedTitle: { en: "Data changed since this card was issued", fr: "Données modifiées depuis l'émission de ce bulletin" },
  changedBody: {
    en: "The results below are what was printed on the card. The school records now differ:",
    fr: "Les résultats ci-dessous sont ceux imprimés sur le bulletin. Les données de l'école sont maintenant différentes :",
  },
  now: { en: "Now", fr: "Actuel" },
  issuedMark: { en: "Printed", fr: "Imprimé" },
  currentRecords: { en: "Current school records", fr: "Données actuelles de l'école" },
  code: { en: "Verification code", fr: "Code de vérification" },
  issuedOn: { en: "Issued on", fr: "Émis le" },
  student: { en: "Student", fr: "Élève" },
  matricule: { en: "Matricule", fr: "Matricule" },
  admission: { en: "Admission no.", fr: "N° d'admission" },
  className: { en: "Class", fr: "Classe" },
  period: { en: "Period", fr: "Période" },
  year: { en: "Academic year", fr: "Année scolaire" },
  subject: { en: "Subject", fr: "Matière" },
  coef: { en: "Coef", fr: "Coef" },
  mark: { en: "Mark", fr: "Note" },
  total: { en: "Total", fr: "Total" },
  grade: { en: "Grade", fr: "Appréciation" },
  pos: { en: "Pos.", fr: "Rang" },
  remark: { en: "Remark", fr: "Remarque" },
  average: { en: "Average", fr: "Moyenne" },
  rank: { en: "Class rank", fr: "Rang en classe" },
  classAvg: { en: "Class average", fr: "Moyenne de la classe" },
  highest: { en: "Highest", fr: "Plus haute" },
  lowest: { en: "Lowest", fr: "Plus basse" },
  totalMarks: { en: "Total points", fr: "Total des points" },
  attendance: { en: "Attendance", fr: "Assiduité" },
  present: { en: "Present", fr: "Présent" },
  absent: { en: "Absent", fr: "Absent" },
  excused: { en: "Excused", fr: "Excusé" },
  late: { en: "Late", fr: "Retards" },
  conduct: { en: "Conduct", fr: "Conduite" },
  decision: { en: "Decision", fr: "Décision" },
  promoted: { en: "Promoted", fr: "Admis(e) en classe supérieure" },
  repeat: { en: "Repeats the class", fr: "Redouble" },
  pending: { en: "Pending", fr: "En attente" },
  areas: { en: "Development areas", fr: "Domaines de développement" },
  teacherComment: { en: "Class teacher's comment", fr: "Appréciation de l'enseignant" },
  principalComment: { en: "Head teacher's remark", fr: "Observation du directeur" },
  classTeacher: { en: "Class teacher", fr: "Enseignant(e)" },
  principal: { en: "Principal / Head teacher", fr: "Directeur / Directrice" },
  print: { en: "Print", fr: "Imprimer" },
} as const;

type Key = keyof typeof T;

const fmt = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  return String(value);
};

interface Props {
  details: Record<string, any>;
  integrity: Record<string, any>;
}

export function ReportCardDetails({ details, integrity }: Props) {
  const [lang, setLang] = useState<Lang>(() =>
    typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en",
  );
  const t = (key: Key) => T[key][lang];
  const school = details.school || {};
  const student = details.student || {};
  const period = details.period || {};
  const grades: any[] = details.grades || [];
  const areas: any[] = details.areas || [];
  const attendance = details.attendance || {};
  const changed = integrity?.status === "changed";
  const showMarks = details.show_average !== false;
  const showCoef = details.show_coefficients !== false && grades.some((g) => g.coefficient !== null && g.coefficient !== undefined);
  const showPos = grades.some((g) => g.position);
  const showClassAvg = details.show_class_average !== false && grades.some((g) => g.class_average !== null && g.class_average !== undefined && g.class_average !== "");
  const issuedAt = integrity?.issued_at ? new Date(integrity.issued_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB") : "";
  const gradeLabel = (g: any) => (lang === "fr" ? g.grade_label_fr || g.grade_label : g.grade_label) || g.grade_letter;
  const decision = details.promotion_decision as string | null | undefined;

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 print:bg-white print:p-0 sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between print:hidden">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-bold">
            {(["en", "fr"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`px-3 py-2 ${lang === code ? "bg-primary text-white" : "text-slate-600"}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-primary"
          >
            <Printer className="h-4 w-4" /> {t("print")}
          </button>
        </div>

        {changed ? (
          <section role="alert" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
              <div className="min-w-0">
                <p className="text-base font-black">{t("changedTitle")}</p>
                <p className="mt-1 text-sm">{t("changedBody")}</p>
                <ul className="mt-2 space-y-1 text-sm font-semibold">
                  {(integrity.changes || []).map((c: any) => (
                    <li key={c.subject}>
                      {c.subject}: {t("issuedMark")} {fmt(c.issued)} {"->"} {t("now")} {fmt(c.current)}
                    </li>
                  ))}
                  {integrity.current ? (
                    <li>
                      {t("currentRecords")}: {t("average")} {fmt(integrity.current.average)} / {t("rank")} {fmt(integrity.current.rank)}
                      {integrity.current.total_students ? ` / ${integrity.current.total_students}` : ""}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-900" role="status">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <p className="flex items-center gap-2 text-base font-black">
                <ShieldCheck className="h-5 w-5" /> {t("verified")}
              </p>
              <p className="mt-1 text-sm">{school.name}</p>
              <p className="text-sm">{t("genuine")}</p>
            </div>
          </section>
        )}

        <article className="rounded-2xl bg-white p-4 shadow-xl print:rounded-none print:shadow-none sm:p-6">
          <header className="flex items-center gap-3 border-b border-slate-200 pb-4">
            {school.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logo} alt="" className="h-14 w-14 shrink-0 rounded-lg object-contain" />
            ) : null}
            <div className="min-w-0">
              <h1 className="break-words text-lg font-black text-primary">{school.name}</h1>
              {school.motto ? <p className="text-xs italic text-slate-500">{school.motto}</p> : null}
              <p className="text-xs text-slate-500">{[school.location, school.region].filter(Boolean).join(", ")}</p>
            </div>
          </header>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 text-sm">
            {[
              [t("student"), student.name],
              [t("matricule"), student.matricule],
              [t("admission"), student.admission_number],
              [t("className"), [student.class_name, student.level && student.level !== student.class_name ? student.level : ""].filter(Boolean).join(" - ")],
              [t("period"), period.name],
              [t("year"), period.academic_year || details.academic_year],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={String(label)} className="min-w-0">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="break-words font-bold text-slate-900">{String(value)}</dd>
                </div>
              ))}
          </dl>

          {areas.length > 0 ? (
            <section className="mb-4">
              <h2 className="mb-2 text-sm font-black text-slate-800">{t("areas")}</h2>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {areas.map((a) => (
                  <li key={a.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 break-words">{lang === "fr" && a.name_fr ? a.name_fr : a.name}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      {(lang === "fr" ? a.label_fr || a.label : a.label) || "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {grades.length > 0 ? (
            <section className="mb-4">
              {/* Phone: one block per subject. Tablet/print: the usual table. */}
              <div className="space-y-2 sm:hidden">
                {grades.map((g) => (
                  <div key={g.subject_name} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-bold">{g.subject_name}</p>
                      {showMarks ? <p className="shrink-0 text-lg font-black text-primary">{fmt(g.score)}</p> : <p className="shrink-0 font-bold">{gradeLabel(g)}</p>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {showCoef ? `${t("coef")} ${fmt(g.coefficient)} · ` : ""}
                      {showMarks && g.total !== null && g.total !== undefined ? `${t("total")} ${fmt(g.total)} · ` : ""}
                      {showMarks ? `${gradeLabel(g)}` : ""}
                      {showPos && g.position ? ` · ${t("pos")} ${g.position}` : ""}
                    </p>
                    {(g.sequence_scores || []).length > 1 ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {g.sequence_scores
                          .map((s: any) => `${(lang === "fr" ? s.evaluation_label_fr : s.evaluation_label) || s.sequence_name}: ${fmt(s.score)}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {g.remark ? <p className="mt-1 text-xs italic text-slate-600">{g.remark}</p> : null}
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block print:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left text-xs text-slate-600">
                      <th className="p-2">{t("subject")}</th>
                      {showCoef ? <th className="p-2 text-center">{t("coef")}</th> : null}
                      <th className="p-2 text-center">{t("mark")}</th>
                      {showMarks ? <th className="p-2 text-center">{t("total")}</th> : null}
                      <th className="p-2 text-center">{t("grade")}</th>
                      {showPos ? <th className="p-2 text-center">{t("pos")}</th> : null}
                      {showClassAvg ? <th className="p-2 text-center">{t("classAvg")}</th> : null}
                      <th className="p-2">{t("remark")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.map((g) => (
                      <tr key={g.subject_name} className="border-b border-slate-100 align-top">
                        <td className="p-2 font-semibold">
                          {g.subject_name}
                          {(g.sequence_scores || []).length > 1 ? (
                            <span className="block text-xs font-normal text-slate-500">
                              {g.sequence_scores
                                .map((s: any) => `${(lang === "fr" ? s.evaluation_label_fr : s.evaluation_label) || s.sequence_name}: ${fmt(s.score)}`)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </td>
                        {showCoef ? <td className="p-2 text-center">{fmt(g.coefficient)}</td> : null}
                        <td className="p-2 text-center font-bold">{showMarks ? fmt(g.score) : "-"}</td>
                        {showMarks ? <td className="p-2 text-center">{fmt(g.total)}</td> : null}
                        <td className="p-2 text-center">{gradeLabel(g)}</td>
                        {showPos ? <td className="p-2 text-center">{fmt(g.position)}</td> : null}
                        {showClassAvg ? <td className="p-2 text-center">{fmt(g.class_average)}</td> : null}
                        <td className="p-2 text-xs">{g.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {(showMarks && details.average !== null && details.average !== undefined) || details.rank ? (
            <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {showMarks && details.average !== null && details.average !== undefined ? (
                <div className="rounded-xl bg-primary p-3 text-white">
                  <p className="text-xs opacity-80">{t("average")}</p>
                  <p className="text-2xl font-black">{fmt(details.average)}<span className="text-sm font-semibold opacity-80"> / {fmt(details.max_score || 20)}</span></p>
                  {details.average_label ? <p className="text-xs">{lang === "fr" ? details.average_label_fr || details.average_label : details.average_label}</p> : null}
                </div>
              ) : null}
              {details.rank ? (
                <div className="rounded-xl bg-amber-100 p-3 text-amber-900">
                  <p className="text-xs">{t("rank")}</p>
                  <p className="text-2xl font-black">{details.rank} <span className="text-sm font-semibold">/ {fmt(details.total_students)}</span></p>
                </div>
              ) : null}
              {showMarks && details.total_marks ? (
                <div className="rounded-xl bg-slate-100 p-3">
                  <p className="text-xs text-slate-500">{t("totalMarks")}</p>
                  <p className="text-xl font-black">{fmt(details.total_marks)}</p>
                </div>
              ) : null}
              {details.class_average !== "" && details.class_average !== undefined && details.class_average !== null ? (
                <div className="rounded-xl bg-slate-100 p-3 text-xs">
                  <p>{t("classAvg")}: <b>{fmt(details.class_average)}</b></p>
                  <p>{t("highest")}: <b>{fmt(details.max_average)}</b></p>
                  <p>{t("lowest")}: <b>{fmt(details.min_average)}</b></p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-2 text-sm">
            {details.show_attendance !== false && Object.keys(attendance).length > 0 ? (
              <p>
                <b>{t("attendance")}:</b> {t("present")} {fmt(attendance.present)} · {t("absent")} {fmt(attendance.absent)} · {t("excused")} {fmt(attendance.excused)} · {t("late")} {fmt(attendance.late)}
              </p>
            ) : null}
            {details.show_conduct !== false && details.conduct ? (
              <p><b>{t("conduct")}:</b> {details.conduct}</p>
            ) : null}
            {decision ? (
              <p>
                <b>{t("decision")}:</b> {decision === "promoted" ? t("promoted") : decision === "repeat" ? t("repeat") : t("pending")}
              </p>
            ) : null}
            {details.teacher_comment ? <p><b>{t("teacherComment")}:</b> {details.teacher_comment}</p> : null}
            {details.headmaster_comment ? <p><b>{t("principalComment")}:</b> {details.headmaster_comment}</p> : null}
          </section>

          <footer className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
            <div>
              <p>{t("classTeacher")}</p>
              <p className="font-bold text-slate-900">{details.signatures?.class_teacher || "-"}</p>
            </div>
            <div className="text-right">
              <p>{t("principal")}</p>
              <p className="font-bold text-slate-900">{details.signatures?.headmaster || school.principal || "-"}</p>
            </div>
            <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 font-mono">
              <span>{t("code")}: {integrity?.hash_code}</span>
              {issuedAt ? <span>{t("issuedOn")} {issuedAt}</span> : null}
            </div>
          </footer>
        </article>
      </div>
    </main>
  );
}
