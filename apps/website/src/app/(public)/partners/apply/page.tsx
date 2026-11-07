"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Loader2, User } from "lucide-react";
import { getPartnerTypes, submitApplication, partnerError, type PartnerType } from "@/lib/partner/client";

type Kind = "individual" | "organization";

const field =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20";
const labelCls = "block text-xs font-bold text-slate-600 mb-1.5";

export default function PartnerApplyPage() {
  const [types, setTypes] = useState<PartnerType[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [typeId, setTypeId] = useState("");
  const [kind, setKind] = useState<Kind | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});

  useEffect(() => {
    getPartnerTypes().then(setTypes).catch(() => setTypes([]));
  }, []);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const selectedType = types.find((t) => t.id === typeId);

  const submit = async () => {
    setError("");
    if (!f.full_name?.trim() || !f.email?.trim()) {
      setError("Please provide at least a name and email.");
      return;
    }
    if (kind === "organization" && !f.organization_name?.trim()) {
      setError("Please provide the organization name.");
      return;
    }
    setBusy(true);
    try {
      const answers =
        kind === "individual"
          ? { profession: f.profession, experience: f.experience, why: f.why, links: f.links }
          : { description: f.org_description, reach: f.reach, links: f.links };
      await submitApplication({
        partner_type: typeId,
        applicant_kind: kind,
        full_name: f.full_name,
        email: f.email,
        phone: f.phone || "",
        country: f.country || "",
        region_city: f.region_city || "",
        website: f.website || "",
        organization_name: kind === "organization" ? f.organization_name || "" : f.organization || "",
        organization_type: f.organization_type || "",
        contact_person_position: f.contact_person_position || "",
        proposed_partnership: f.proposed_partnership || "",
        contribution: f.contribution || "",
        answers,
      });
      setDone(true);
    } catch (err: any) {
      setError(partnerError(err, "We could not submit your application. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
          <h1 className="mt-5 text-3xl font-black text-[#12314d]">Application received</h1>
          <p className="mt-3 text-slate-600">
            Thank you for applying to partner with EduIgnite. Our team will review your application and get back to
            you by email. Submitting an application does not create an account — that happens only once you're approved.
          </p>
          <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#264D73] px-6 py-3 text-sm font-bold text-white hover:bg-[#1c3c5c]">
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-b from-[#EAF3FA] to-white">
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:px-8">
        <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Partner programme
        </Link>

        {/* progress */}
        <div className="mt-6 flex items-center gap-2 text-xs font-bold">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? "bg-[#264D73]" : "bg-slate-200"}`} />
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {step === 1 && (
            <>
              <h1 className="text-xl font-black text-[#12314d]">What type of partner do you want to become?</h1>
              <p className="mt-1.5 text-sm text-slate-500">Choose the partnership that best fits you.</p>
              <div className="mt-5 grid gap-3">
                {types.length === 0 && <p className="text-sm text-slate-500">No partnership types are open right now. Please check back later.</p>}
                {types.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTypeId(t.id)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${typeId === t.id ? "border-[#264D73] bg-[#EAF3FA]" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <p className="font-black text-[#12314d]">{t.name}</p>
                    {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
                  </button>
                ))}
              </div>
              {selectedType?.instructions && (
                <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{selectedType.instructions}</p>
              )}
              <button
                disabled={!typeId}
                onClick={() => setStep(2)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-50"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-black text-[#12314d]">Are you applying as…</h1>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {([["individual", User, "Individual", "You're applying in your own name."], ["organization", Building2, "Organization", "A company, school or institution."]] as const).map(
                  ([k, Icon, title, note]) => (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className={`rounded-2xl border p-5 text-left transition-colors ${kind === k ? "border-[#264D73] bg-[#EAF3FA]" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <Icon className="h-6 w-6 text-[#264D73]" />
                      <p className="mt-2 font-black text-[#12314d]">{title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{note}</p>
                    </button>
                  ),
                )}
              </div>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">Back</button>
                <button disabled={!kind} onClick={() => setStep(3)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-50">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-xl font-black text-[#12314d]">
                {kind === "organization" ? "About your organization" : "About you"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">Applying as a <strong>{selectedType?.name}</strong> ({kind}).</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {kind === "organization" && (
                  <>
                    <div className="sm:col-span-2"><label className={labelCls}>Organization name *</label><input className={field} value={f.organization_name || ""} onChange={(e) => set("organization_name", e.target.value)} /></div>
                    <div><label className={labelCls}>Organization type</label><input className={field} value={f.organization_type || ""} onChange={(e) => set("organization_type", e.target.value)} placeholder="NGO, company, school…" /></div>
                    <div><label className={labelCls}>Contact person position</label><input className={field} value={f.contact_person_position || ""} onChange={(e) => set("contact_person_position", e.target.value)} /></div>
                  </>
                )}
                <div><label className={labelCls}>{kind === "organization" ? "Contact person full name *" : "Full name *"}</label><input className={field} value={f.full_name || ""} onChange={(e) => set("full_name", e.target.value)} /></div>
                <div><label className={labelCls}>{kind === "organization" ? "Official email *" : "Email *"}</label><input className={field} type="email" value={f.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
                <div><label className={labelCls}>Phone</label><input className={field} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
                <div><label className={labelCls}>Country</label><input className={field} value={f.country || ""} onChange={(e) => set("country", e.target.value)} /></div>
                <div><label className={labelCls}>Region / City</label><input className={field} value={f.region_city || ""} onChange={(e) => set("region_city", e.target.value)} /></div>
                <div><label className={labelCls}>Website / social link</label><input className={field} value={f.website || ""} onChange={(e) => set("website", e.target.value)} /></div>

                {kind === "individual" && (
                  <>
                    <div><label className={labelCls}>Profession / occupation</label><input className={field} value={f.profession || ""} onChange={(e) => set("profession", e.target.value)} /></div>
                    <div><label className={labelCls}>Organization / company (if any)</label><input className={field} value={f.organization || ""} onChange={(e) => set("organization", e.target.value)} /></div>
                    <div className="sm:col-span-2"><label className={labelCls}>Relevant experience</label><textarea className={`${field} min-h-20`} value={f.experience || ""} onChange={(e) => set("experience", e.target.value)} /></div>
                    <div className="sm:col-span-2"><label className={labelCls}>Why do you want to partner with EduIgnite?</label><textarea className={`${field} min-h-20`} value={f.why || ""} onChange={(e) => set("why", e.target.value)} /></div>
                  </>
                )}
                {kind === "organization" && (
                  <>
                    <div className="sm:col-span-2"><label className={labelCls}>Organization description</label><textarea className={`${field} min-h-20`} value={f.org_description || ""} onChange={(e) => set("org_description", e.target.value)} /></div>
                    <div className="sm:col-span-2"><label className={labelCls}>Reach / capacity</label><textarea className={`${field} min-h-20`} value={f.reach || ""} onChange={(e) => set("reach", e.target.value)} placeholder="How many schools/people can you reach?" /></div>
                  </>
                )}

                <div className="sm:col-span-2"><label className={labelCls}>What can you contribute?</label><textarea className={`${field} min-h-20`} value={f.contribution || ""} onChange={(e) => set("contribution", e.target.value)} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Proposed partnership</label><textarea className={`${field} min-h-20`} value={f.proposed_partnership || ""} onChange={(e) => set("proposed_partnership", e.target.value)} placeholder="How do you see this partnership working?" /></div>
              </div>

              {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
              <div className="mt-6 flex gap-2">
                <button onClick={() => setStep(2)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">Back</button>
                <button onClick={submit} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit application
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
