"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Edit3, Globe, Loader2, MousePointerClick, School, Share2, TrendingUp } from "lucide-react";
import { getPortal, updatePublicProfile, type PortalData } from "@/lib/partner/client";

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#264D73]/8 text-[#264D73]">{icon}</span>
      <p className="mt-3 text-2xl font-black text-[#12314d]">{value}</p>
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function PartnerPortalPage() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ public_name: "", public_description: "", public_website: "", logo_url: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getPortal();
      setData(d);
      setProfile({
        public_name: d.partner.public_name || "",
        public_description: d.partner.public_description || "",
        public_website: d.partner.public_website || "",
        logo_url: d.partner.logo_url || "",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async () => {
    if (!data?.referral.link) return;
    try { await navigator.clipboard.writeText(data.referral.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try { await updatePublicProfile(profile); await load(); setEditing(false); } finally { setSavingProfile(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#264D73]/50" /></div>;
  if (!data) return <p className="text-sm text-slate-500">Could not load your portal. Please refresh.</p>;

  const r = data.referral;
  const maxSchools = Math.max(1, ...data.timeline.map((t) => t.schools));
  const waText = `Join EduIgnite — school management built for Cameroon. Get your school set up: ${r.link}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[#12314d]">Your EduIgnite impact</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data.partner.display_name} · {data.partner.partner_type || "Partner"}
        </p>
      </div>

      {/* Performance */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={<MousePointerClick className="h-5 w-5" />} label="Link clicks" value={r.clicks} />
        <Stat icon={<School className="h-5 w-5" />} label="Applications" value={r.applications} />
        <Stat icon={<Check className="h-5 w-5" />} label="Approved schools" value={r.approved_schools} />
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Active schools" value={r.active_schools} />
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Conversion" value={`${r.conversion_rate}%`} sub="schools / clicks" />
      </div>

      {/* Referral link */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2"><Share2 className="h-5 w-5 text-[#264D73]" /><h2 className="text-lg font-black text-[#12314d]">Your referral link</h2></div>
        <p className="mt-1.5 text-sm text-slate-500">Share this link. A school you introduce is credited to you when it joins EduIgnite.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input readOnly value={r.link} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-700" />
          <div className="flex gap-2">
            <button onClick={copy} className="inline-flex items-center gap-2 rounded-xl bg-[#264D73] px-4 py-3 text-sm font-bold text-white hover:bg-[#1c3c5c]">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-green-500 px-4 py-3 text-sm font-bold text-green-600 hover:bg-green-50">Share</a>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-mono uppercase tracking-widest text-slate-400">Code: {r.code}</p>
      </div>

      {/* Chart + schools */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-black text-[#12314d]">Schools over time</h2>
          <div className="mt-5 flex h-40 items-end gap-2">
            {data.timeline.map((t) => (
              <div key={t.month} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full items-end" style={{ height: "120px" }}>
                  <div className="mx-auto w-5 rounded-t bg-[#264D73]" style={{ height: `${(t.schools / maxSchools) * 100}%`, minHeight: t.schools ? "4px" : "0" }} />
                </div>
                <span className="text-[9px] font-semibold text-slate-400">{t.month.split(" ")[0]}</span>
                <span className="text-[10px] font-black text-[#264D73]">{t.schools}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 rounded-3xl border border-slate-200 bg-white p-6">
          {data.lifecycle && data.lifecycle.length > 0 && (
            <div className="mb-5">
              <h2 className="text-lg font-black text-[#12314d]">Where your schools are</h2>
              <p className="mt-1 text-sm text-slate-500">Every school you introduce moves through these stages. Only onboarded schools count towards your rewards.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.lifecycle.map((st) => (
                  <div key={st.stage} className={`rounded-2xl border p-3.5 ${st.stage === "processed" ? "border-green-200 bg-green-50" : st.stage === "rejected" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`} title={st.blurb}>
                    <div className="text-2xl font-black text-[#12314d]">{st.count}</div>
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{st.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <h2 className="text-lg font-black text-[#12314d]">Referred schools</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
            {data.schools.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No schools yet. Share your link to get started.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400">
                  <tr><th className="px-4 py-2.5 text-left">School</th><th className="px-4 py-2.5 text-left">Region</th><th className="px-4 py-2.5 text-left">Stage</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.schools.map((s, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-semibold text-[#12314d]">{s.school_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{s.region}</td>
                      <td className="px-4 py-2.5" title={s.stage_blurb}>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${s.stage === "processed" ? "bg-green-100 text-green-700" : s.stage === "rejected" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"}`}>{s.stage_label || s.status}</span>
                        {s.step && !s.is_final && <span className="ml-2 text-[10px] font-bold text-slate-400">Step {s.step} of {s.total_steps}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Public profile */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2"><Globe className="h-5 w-5 text-[#264D73]" /><h2 className="text-lg font-black text-[#12314d]">Public profile</h2></div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${data.partner.is_public ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
            {data.partner.is_public ? "Shown on Our Partners" : "Not public yet"}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">Edit how you'd like to appear publicly. EduIgnite reviews and controls whether your profile is shown.</p>

        {!editing ? (
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-black text-[#12314d]">{data.partner.public_name || data.partner.display_name}</p>
              {data.partner.public_description && <p className="mt-1 text-sm text-slate-600">{data.partner.public_description}</p>}
              {data.partner.public_website && <a href={data.partner.public_website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-bold text-[#264D73] hover:underline">{data.partner.public_website}</a>}
            </div>
            <button onClick={() => setEditing(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-bold text-[#264D73] hover:border-slate-300"><Edit3 className="h-4 w-4" /> Edit</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="Public name" value={profile.public_name} onChange={(e) => setProfile({ ...profile, public_name: e.target.value })} />
            <textarea className="w-full min-h-20 rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="Public description" value={profile.public_description} onChange={(e) => setProfile({ ...profile, public_description: e.target.value })} />
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="Website" value={profile.public_website} onChange={(e) => setProfile({ ...profile, public_website: e.target.value })} />
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="Logo image URL" value={profile.logo_url} onChange={(e) => setProfile({ ...profile, logo_url: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={saveProfile} disabled={savingProfile} className="inline-flex items-center gap-2 rounded-xl bg-[#264D73] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1c3c5c] disabled:opacity-60">
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
