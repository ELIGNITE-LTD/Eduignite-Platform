"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { canAccessModule } from "@/lib/executive-modules";
import { useToast } from "@/hooks/use-toast";
import partnersAdmin, {
  type PartnerAdmin, type PartnerApplicationAdmin, type PartnerOverview,
  type PartnerTypeAdmin, type PerformanceRow,
} from "@/lib/api/services/partners-admin";
import {
  BarChart3, Check, Handshake, Layers, Loader2, Plus, Trash2, Users, X,
} from "lucide-react";

const EXEC = ["CEO", "CTO", "SUPER_ADMIN", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
const TABS = ["Overview", "Applications", "Partners", "Types", "Performance"] as const;
type Tab = (typeof TABS)[number];

export default function PartnersAdminPage() {
  const { user } = useAuth();
  const allowed =
    EXEC.includes(String(user?.role || "")) &&
    canAccessModule(user?.role, (user as any)?.allowed_modules, "partners");
  const [tab, setTab] = useState<Tab>("Overview");

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <Handshake className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Executives only</h1>
        <p className="mt-2 text-sm text-muted-foreground">The partner programme is managed by the CEO, the CTO and executives assigned to it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="flex items-center gap-3 font-headline text-2xl font-bold text-primary md:text-3xl">
          <span className="rounded-xl bg-primary p-2 text-white shadow-lg"><Handshake className="h-6 w-6 text-secondary" /></span>
          Partners
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Partnership applications, partner accounts, public profiles and referral performance.</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-black transition-colors ${tab === t ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab />}
      {tab === "Applications" && <ApplicationsTab />}
      {tab === "Partners" && <PartnersTab />}
      {tab === "Types" && <TypesTab />}
      {tab === "Performance" && <PerformanceTab />}
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary/40" /></div>;
}

// ── Overview ──────────────────────────────────────────────────────────────
function OverviewTab() {
  const [data, setData] = useState<PartnerOverview | null>(null);
  useEffect(() => { partnersAdmin.overview().then(setData).catch(() => {}); }, []);
  if (!data) return <Spinner />;
  const cards: [string, number][] = [
    ["Total partners", data.total_partners], ["Active", data.active_partners],
    ["Pending applications", data.pending_applications], ["Account creation pending", data.account_pending],
    ["Suspended", data.suspended_partners], ["Inactive", data.inactive_partners],
    ["Individuals", data.individual_partners], ["Organizations", data.organization_partners],
    ["New this month", data.new_partners_this_month], ["Active referring", data.active_referring_partners],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-3xl font-black text-primary">{value}</p>
          <p className="mt-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Applications ──────────────────────────────────────────────────────────
const APP_STATUSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700", under_review: "bg-blue-100 text-blue-700",
  more_info: "bg-purple-100 text-purple-700", approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700", account_created: "bg-slate-200 text-slate-600",
};

function ApplicationsTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PartnerApplicationAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState("");
  const [open, setOpen] = useState<PartnerApplicationAdmin | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await partnersAdmin.listApplications(statusF ? { status: statusF } : undefined)); }
    finally { setLoading(false); }
  }, [statusF]);
  useEffect(() => { load(); }, [load]);

  const review = async (action: string) => {
    if (!open) return;
    setBusy(true);
    try {
      await partnersAdmin.reviewApplication(open.id, action, message);
      toast({ title: "Application updated", description: action === "approve" ? "Approval email sent with account link." : "Applicant notified." });
      setOpen(null); setMessage(""); load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not update", description: e?.response?.data?.detail || "Try again." });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["", "pending", "under_review", "more_info", "approved", "rejected", "account_created"].map((s) => (
          <button key={s || "all"} onClick={() => setStatusF(s)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusF === s ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>
            {s ? s.replace("_", " ") : "all"}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty label="No applications." /> : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <tr><th className="px-4 py-3 text-left">Applicant</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Kind</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Applied</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => { setOpen(a); setMessage(""); }}>
                  <td className="px-4 py-3"><p className="font-bold text-primary">{a.organization_name || a.full_name}</p><p className="text-xs text-slate-400">{a.email}</p></td>
                  <td className="px-4 py-3 text-slate-600">{a.partner_type_name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.applicant_kind}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${APP_STATUSES[a.status] || "bg-slate-100"}`}>{a.status_display}</span></td>
                  <td className="px-4 py-3 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal onClose={() => setOpen(null)} title={open.organization_name || open.full_name}>
          <div className="space-y-2 text-sm">
            <Row k="Status" v={open.status_display} />
            <Row k="Type" v={open.partner_type_name} />
            <Row k="Kind" v={open.applicant_kind} />
            <Row k="Email" v={open.email} /><Row k="Phone" v={open.phone} />
            <Row k="Location" v={[open.region_city, open.country].filter(Boolean).join(", ")} />
            {open.website && <Row k="Website" v={open.website} />}
            {open.organization_type && <Row k="Org type" v={open.organization_type} />}
            {open.contact_person_position && <Row k="Position" v={open.contact_person_position} />}
            {open.proposed_partnership && <Block k="Proposed partnership" v={open.proposed_partnership} />}
            {open.contribution && <Block k="Can contribute" v={open.contribution} />}
            {Object.entries(open.answers || {}).filter(([, v]) => v).map(([k, v]) => <Block key={k} k={k} v={String(v)} />)}
          </div>
          {open.status !== "account_created" && open.status !== "approved" && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to the applicant (for request-info / reject)" className="w-full min-h-20 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => review("approve")} className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700"><Check className="h-4 w-4" /> Approve</button>
                <button disabled={busy} onClick={() => review("request_info")} className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700">Request info</button>
                <button disabled={busy} onClick={() => review("reject")} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Reject</button>
                <button disabled={busy} onClick={() => review("under_review")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Mark under review</button>
              </div>
            </div>
          )}
          {open.status === "approved" && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">Approved — the applicant has an account-creation link. Waiting for them to create the account.</p>}
        </Modal>
      )}
    </div>
  );
}

// ── Partners ──────────────────────────────────────────────────────────────
function PartnersTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PartnerAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState("");
  const [open, setOpen] = useState<PartnerAdmin | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await partnersAdmin.listPartners(statusF ? { status: statusF } : undefined)); }
    finally { setLoading(false); }
  }, [statusF]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    try { setOpen(await partnersAdmin.getPartner(id)); } catch { /* ignore */ }
  };

  const act = async (action: string) => {
    if (!open) return;
    if (action === "delete" && !confirm("Permanently delete this partner account? The application record is kept.")) return;
    setBusy(true);
    try {
      await partnersAdmin.partnerAction(open.id, action);
      toast({ title: "Done", description: `Partner ${action}d.` });
      setOpen(null); load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not update", description: e?.response?.data?.detail || "Try again." });
    } finally { setBusy(false); }
  };

  const togglePublic = async (val: boolean) => {
    if (!open) return;
    try { const updated = await partnersAdmin.updatePartner(open.id, { is_public: val }); setOpen({ ...open, ...updated }); load(); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["", "active", "suspended", "inactive", "account_pending"].map((s) => (
          <button key={s || "all"} onClick={() => setStatusF(s)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusF === s ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>{s ? s.replace("_", " ") : "all"}</button>
        ))}
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty label="No partners yet." /> : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <tr><th className="px-4 py-3 text-left">Partner</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Public</th><th className="px-4 py-3 text-left">Code</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(p.id)}>
                  <td className="px-4 py-3"><p className="font-bold text-primary">{p.display_name}</p><p className="text-xs text-slate-400">{p.email}</p></td>
                  <td className="px-4 py-3 text-slate-600">{p.partner_type_name}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">{p.status_display}</span></td>
                  <td className="px-4 py-3">{p.is_public ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-slate-300" />}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.referral_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal onClose={() => setOpen(null)} title={open.display_name}>
          <div className="space-y-2 text-sm">
            <Row k="Email" v={open.email} /><Row k="Type" v={open.partner_type_name} />
            <Row k="Status" v={open.status_display} /><Row k="Referral code" v={open.referral_code} />
            <Row k="Last activity" v={open.last_activity_at ? new Date(open.last_activity_at).toLocaleString() : "Never used"} />
            {open.referral && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-5">
                <Mini k="Clicks" v={open.referral.clicks} /><Mini k="Applications" v={open.referral.applications} />
                <Mini k="Approved" v={open.referral.approved_schools} /><Mini k="Active" v={open.referral.active_schools} />
                <Mini k="Conversion" v={`${open.referral.conversion_rate}%`} />
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <button disabled={busy} onClick={() => act("activate")} className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700">Activate</button>
            <button disabled={busy} onClick={() => act("suspend")} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600">Suspend</button>
            <button disabled={busy} onClick={() => act("delete")} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"><Trash2 className="h-4 w-4" /> Delete</button>
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
              <input type="checkbox" checked={open.is_public} onChange={(e) => togglePublic(e.target.checked)} /> Show on Our Partners
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────
function TypesTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PartnerTypeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ id?: string; name: string; description: string; instructions: string; is_active: boolean }>({ name: "", description: "", instructions: "", is_active: true });
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { setRows(await partnersAdmin.listTypes()); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return;
    try {
      if (form.id) await partnersAdmin.updateType(form.id, form);
      else await partnersAdmin.createType(form);
      setForm({ name: "", description: "", instructions: "", is_active: true }); setEditing(false); load();
    } catch (e: any) { toast({ variant: "destructive", title: "Could not save", description: e?.response?.data?.detail || "Try again." }); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this partner type?")) return;
    try { const r = await partnersAdmin.deleteType(id); if (r?.detail) toast({ title: "Deactivated", description: r.detail }); load(); }
    catch { toast({ variant: "destructive", title: "Could not delete" }); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-3">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty label="No partner types yet — create one so people can apply." /> : rows.map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="font-black text-primary">{t.name} {!t.is_active && <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">off</span>}</p>
              {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
              <p className="mt-1 text-[11px] text-slate-400">{t.application_count} application(s)</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => { setForm({ id: t.id, name: t.name, description: t.description, instructions: t.instructions, is_active: t.is_active }); setEditing(true); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-primary">Edit</button>
              <button onClick={() => remove(t.id)} className="rounded-lg px-2 py-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 font-black text-primary"><Plus className="h-4 w-4" /> {editing ? "Edit type" : "New type"}</h3>
        <div className="mt-4 space-y-3">
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Name (e.g. Marketing Partner)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea className="w-full min-h-16 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className="w-full min-h-16 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Instructions for applicants (optional)" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Available for applications</label>
          <div className="flex gap-2">
            {editing && <button onClick={() => { setForm({ name: "", description: "", instructions: "", is_active: true }); setEditing(false); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancel</button>}
            <button onClick={save} className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white">{editing ? "Save" : "Create type"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Performance ───────────────────────────────────────────────────────────
function PerformanceTab() {
  const [data, setData] = useState<{ totals: any; leaderboard: PerformanceRow[] } | null>(null);
  useEffect(() => { partnersAdmin.performance().then(setData).catch(() => {}); }, []);
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-5">
        {[["Clicks", data.totals.clicks], ["Applications", data.totals.applications], ["Approved", data.totals.approved_schools], ["Active", data.totals.active_schools], ["Conversion", `${data.totals.conversion_rate}%`]].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-primary">{v as any}</p><p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{k}</p></div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400">
            <tr><th className="px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Partner</th><th className="px-4 py-3 text-right">Clicks</th><th className="px-4 py-3 text-right">Schools</th><th className="px-4 py-3 text-right">Conversion</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.leaderboard.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No active partners yet.</td></tr> :
              data.leaderboard.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-black text-slate-400">{r.rank}</td>
                  <td className="px-4 py-3"><p className="font-bold text-primary">{r.name}</p><p className="text-xs text-slate-400">{r.partner_type}</p></td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.clicks}</td>
                  <td className="px-4 py-3 text-right font-black text-primary">{r.approved_schools}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.conversion_rate}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Ranked by schools actually set up, then conversion — not by raw clicks.</p>
    </div>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────
function Empty({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">{label}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-slate-50 py-1"><span className="text-slate-400">{k}</span><span className="text-right font-semibold text-slate-700">{v || "—"}</span></div>;
}
function Block({ k, v }: { k: string; v: string }) {
  return <div className="py-1"><p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{k.replace(/_/g, " ")}</p><p className="mt-0.5 whitespace-pre-line text-slate-700">{v}</p></div>;
}
function Mini({ k, v }: { k: string; v: any }) {
  return <div className="text-center"><p className="text-lg font-black text-primary">{v}</p><p className="text-[10px] font-semibold text-slate-400">{k}</p></div>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-black text-primary">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
