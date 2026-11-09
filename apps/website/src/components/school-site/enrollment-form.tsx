"use client";

import { useMemo, useRef, useState } from "react";

import {
  ADMISSIONS_API,
  ERROR_TEXT,
  formText,
  RELATIONSHIP_LABELS,
  type AdmissionConfig,
} from "@/lib/admissions";
import type { SchoolLang } from "@/lib/public-schools";

const INPUT =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus-visible:border-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700/40 aria-[invalid=true]:border-red-600";

type Errors = Record<string, string>;

function newSubmissionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function EnrollmentForm({ slug, lang, config }: { slug: string; lang: SchoolLang; config: AdmissionConfig }) {
  const t = formText(lang, config.education_category);
  const formRef = useRef<HTMLFormElement>(null);
  const submissionId = useRef(newSubmissionId());
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState("");
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState("");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const mode = (key: string) => config.fields[key];
  const show = (key: string) => Boolean(mode(key));
  const req = (key: string) => mode(key) === "required";
  const consentText = config.consent_text[lang] || config.consent_text.en;
  const groups = useMemo(() => {
    const out: Record<string, AdmissionConfig["classes"]> = {};
    for (const c of config.classes) (out[c.group] ||= []).push(c);
    return out;
  }, [config.classes]);

  const message = (code?: string) => (code ? (ERROR_TEXT[code]?.[lang] ?? ERROR_TEXT.invalid[lang]) : "");

  function Field({ name, label, required, children }: { name: string; label: string; required: boolean; children: React.ReactNode }) {
    return (
      <div>
        <label htmlFor={`f-${name}`} className="block text-sm font-semibold text-slate-800">
          {label}
          {required ? <span className="text-red-700" aria-hidden> *</span> : <span className="font-normal text-slate-500"> ({t.optional})</span>}
        </label>
        {children}
        {errors[name] ? (
          <p id={`e-${name}`} role="alert" className="mt-1 text-sm text-red-700">{message(errors[name])}</p>
        ) : null}
      </div>
    );
  }

  const aria = (name: string, required: boolean) => ({
    id: `f-${name}`,
    name,
    required,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `e-${name}` : undefined,
  });

  function clientCheck(data: FormData): Errors {
    const found: Errors = {};
    const value = (k: string) => String(data.get(k) ?? "").trim();
    for (const key of ["student_full_name", "guardian_name"]) if (!value(key)) found[key] = "required";
    for (const [key, m] of Object.entries(config.fields)) {
      if (m === "required" && !value(key)) found[key] = "required";
    }
    if (!consent) found.consent = "required";
    return found;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const data = new FormData(event.currentTarget);
    const local = clientCheck(data);
    setBanner("");
    if (Object.keys(local).length) {
      setErrors(local);
      setBanner(t.fixErrors);
      (formRef.current?.querySelector(`#f-${Object.keys(local)[0]}`) as HTMLElement | null)?.focus();
      return;
    }
    setErrors({});
    const body = new FormData();
    data.forEach((v, k) => {
      if (k !== "documents") body.append(k, v);
    });
    body.set("consent", "true");
    body.set("language", lang);
    body.set("form_token", config.form_token);
    body.set("submission_id", submissionId.current);
    files.forEach((f) => body.append("documents", f));
    setSending(true);
    try {
      const res = await fetch(`${ADMISSIONS_API}/schools/public/${encodeURIComponent(slug)}/enrollment/`, {
        method: "POST",
        body,
        credentials: "omit",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.reference) {
        setReference(String(json.reference));
        formRef.current?.reset();
        return;
      }
      if (res.status === 429) {
        setBanner(json?.errors?.detail === "contact_limit" ? message("contact_limit") : t.throttled);
      } else if (json?.errors) {
        const next: Errors = {};
        for (const [k, v] of Object.entries(json.errors)) next[k] = String(v);
        setErrors(next);
        setBanner(next.form ? message(next.form) : t.fixErrors);
      } else {
        setBanner(t.networkError);
      }
    } catch {
      setBanner(t.networkError);
    } finally {
      setSending(false);
    }
  }

  if (reference) {
    return (
      <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
        <h2 className="text-2xl font-bold text-green-900">{t.thanksTitle}</h2>
        <p className="mt-3 text-slate-700">{t.thanksText}</p>
        <p className="mt-4 select-all rounded-lg bg-white px-4 py-3 font-mono text-2xl font-bold tracking-wider text-blue-900">{reference}</p>
        <p className="mt-4 text-sm text-slate-600">{t.thanksEmail}</p>
        <button
          type="button"
          onClick={() => { setReference(""); setConsent(false); setFiles([]); submissionId.current = newSubmissionId(); }}
          className="mt-6 text-sm font-semibold text-blue-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          {t.again}
        </button>
      </div>
    );
  }

  const docTypes = config.documents.types.map((x) => x.toUpperCase()).join(", ");

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
      {banner ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{banner}</p> : null}

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-blue-950">{t.student}</legend>
        <Field name="student_full_name" label={t.fullName} required>
          <input {...aria("student_full_name", true)} type="text" autoComplete="off" maxLength={200} className={INPUT} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {show("student_dob") ? (
            <Field name="student_dob" label={t.dob} required={req("student_dob")}>
              <input {...aria("student_dob", req("student_dob"))} type="date" max={new Date().toISOString().slice(0, 10)} className={INPUT} />
            </Field>
          ) : null}
          {show("student_gender") ? (
            <Field name="student_gender" label={t.gender} required={req("student_gender")}>
              <select {...aria("student_gender", req("student_gender"))} defaultValue="" className={INPUT}>
                <option value="">{t.select}</option>
                <option value="male">{t.male}</option>
                <option value="female">{t.female}</option>
                <option value="other">{t.other}</option>
              </select>
            </Field>
          ) : null}
        </div>
        {show("previous_school") ? (
          <Field name="previous_school" label={t.previousSchool} required={req("previous_school")}>
            <input {...aria("previous_school", req("previous_school"))} type="text" maxLength={200} className={INPUT} />
          </Field>
        ) : null}
        {show("class_applied") ? (
          <Field name="class_applied" label={t.program} required={req("class_applied")}>
            <select {...aria("class_applied", req("class_applied"))} defaultValue="" className={INPUT}>
              <option value="">{t.selectClass}</option>
              {Object.entries(groups).map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-blue-950">{t.guardian}</legend>
        <Field name="guardian_name" label={t.guardianName} required>
          <input {...aria("guardian_name", true)} type="text" autoComplete="name" maxLength={200} className={INPUT} />
        </Field>
        {show("guardian_relationship") ? (
          <Field name="guardian_relationship" label={t.relationship} required={req("guardian_relationship")}>
            <select {...aria("guardian_relationship", req("guardian_relationship"))} defaultValue="" className={INPUT}>
              <option value="">{t.select}</option>
              {config.relationships.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABELS[r]?.[lang] ?? r}</option>)}
            </select>
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {show("guardian_phone") ? (
            <Field name="guardian_phone" label={t.phone} required={req("guardian_phone")}>
              <input {...aria("guardian_phone", req("guardian_phone"))} type="tel" autoComplete="tel" maxLength={30} className={INPUT} />
            </Field>
          ) : null}
          {show("guardian_email") ? (
            <Field name="guardian_email" label={t.email} required={req("guardian_email")}>
              <input {...aria("guardian_email", req("guardian_email"))} type="email" autoComplete="email" maxLength={254} className={INPUT} />
            </Field>
          ) : null}
        </div>
        {show("guardian_address") ? (
          <Field name="guardian_address" label={t.address} required={req("guardian_address")}>
            <input {...aria("guardian_address", req("guardian_address"))} type="text" autoComplete="street-address" maxLength={300} className={INPUT} />
          </Field>
        ) : null}
      </fieldset>

      {show("message") ? (
        <Field name="message" label={t.message} required={req("message")}>
          <textarea {...aria("message", req("message"))} rows={4} maxLength={2000} className={INPUT} />
        </Field>
      ) : null}

      {config.documents.max_files > 0 && config.documents.types.length ? (
        <div>
          <label htmlFor="f-documents" className="block text-sm font-semibold text-slate-800">
            {t.documents} <span className="font-normal text-slate-500">({t.optional})</span>
          </label>
          <input
            id="f-documents"
            type="file"
            multiple
            accept={config.documents.types.map((x) => (x === "pdf" ? ".pdf" : x === "jpg" ? ".jpg,.jpeg" : ".png")).join(",")}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            aria-describedby="h-documents"
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-900"
          />
          <p id="h-documents" className="mt-1 text-xs text-slate-500">{t.documentsHelp(docTypes, config.documents.max_mb, config.documents.max_files)}</p>
          {errors.documents ? <p role="alert" className="mt-1 text-sm text-red-700">{message(errors.documents)}</p> : null}
        </div>
      ) : null}

      {/* Honeypot: people never see or reach this field; bots fill it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          {t.honeypot}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            id="f-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "e-consent" : undefined}
            className="mt-1 h-4 w-4 rounded border-slate-400 accent-green-700"
          />
          <span>{consentText}</span>
        </label>
        {errors.consent ? <p id="e-consent" role="alert" className="mt-1 text-sm text-red-700">{message(errors.consent)}</p> : null}
        <p className="mt-2 text-xs text-slate-500">{t.privacy}</p>
      </div>

      <button
        type="submit"
        disabled={sending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-green-700 px-5 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {sending ? t.sending : t.submit}
      </button>
    </form>
  );
}
