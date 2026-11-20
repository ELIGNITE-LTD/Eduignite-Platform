"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, BellRing, CheckCircle2, Clock, Loader2, Mail, RefreshCw, ShieldAlert, ShieldCheck, Siren, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { watchService, type WatchCheck, type WatchIncident, type WatchOverview } from "@/lib/api/services/watch.service";

const SEV: Record<string, { label: string; bar: string; chip: string }> = {
  critical: { label: "Critical", bar: "bg-red-500", chip: "bg-red-100 text-red-800" },
  warning: { label: "Warning", bar: "bg-amber-400", chip: "bg-amber-100 text-amber-800" },
  info: { label: "Info", bar: "bg-sky-400", chip: "bg-sky-100 text-sky-800" },
};
const STATUS_LABEL: Record<string, string> = { open: "Open", acknowledged: "Being handled", resolved: "Resolved", ignored: "Ignored" };
const CATEGORIES = ["server", "client", "security", "health", "payments", "ai", "email", "jobs", "traffic"];
const CATEGORY_LABEL: Record<string, string> = { server: "Server errors", client: "App errors on devices", security: "Security", health: "System health", payments: "Payments", ai: "AI service", email: "Email delivery", jobs: "Background jobs", traffic: "Traffic" };
const SOURCE_LABEL: Record<string, string> = { api: "Server", web: "Website", mobile: "Mobile app", desktop: "Desktop app", worker: "Background worker", monitor: "Health check" };

function ago(iso?: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function StatePill({ state }: { state: WatchOverview["state"] }) {
  const map = {
    healthy: { icon: ShieldCheck, text: "All systems normal", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    degraded: { icon: AlertTriangle, text: "Some things need attention", cls: "bg-amber-50 text-amber-900 border-amber-200" },
    critical: { icon: Siren, text: "Something needs attention now", cls: "bg-red-50 text-red-800 border-red-200" },
  }[state];
  const Icon = map.icon;
  return <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black ${map.cls}`}><Icon className="h-4 w-4" />{map.text}</span>;
}

function CheckCard({ c }: { c: WatchCheck }) {
  const tone = c.status === "ok" ? "border-emerald-200 bg-emerald-50/50" : c.status === "warn" ? "border-amber-300 bg-amber-50/60" : "border-red-300 bg-red-50/60";
  const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
  const color = c.status === "ok" ? "text-emerald-600" : c.status === "warn" ? "text-amber-600" : "text-red-600";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black">{c.label}</p>
        <Icon className={`h-5 w-5 ${color}`} aria-label={c.status} />
      </div>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{c.detail}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {c.status === "ok" ? "OK" : c.status === "warn" ? "Warning" : "Failing"} since {ago(c.since)}{c.latency_ms !== null ? ` · ${c.latency_ms} ms` : ""}
      </p>
    </div>
  );
}

/** 24 bars, one per hour: all requests (pale) with server errors (red) and app errors (amber) on top. Plain SVG, no library. */
function TrafficChart({ data }: { data: WatchOverview["series"] }) {
  const max = Math.max(1, ...data.map((d) => d.requests));
  const W = 720, H = 180, gap = 4;
  const bw = data.length ? (W - gap * (data.length - 1)) / data.length : W;
  if (!data.length) return <p className="py-10 text-center text-sm text-muted-foreground">No traffic recorded yet. Counts appear after the first hour.</p>;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="min-w-[560px] w-full" role="img" aria-label="Requests and errors per hour for the last 24 hours">
        {data.map((d, i) => {
          const x = i * (bw + gap);
          const h = (d.requests / max) * H;
          const e = (d.errors_5xx / max) * H;
          const c = (d.client_errors / max) * H;
          return (
            <g key={d.hour}>
              <title>{`${when(d.hour)}: ${d.requests} requests, ${d.errors_5xx} server errors, ${d.client_errors} app errors, ${d.login_failures} failed sign-ins`}</title>
              <rect x={x} y={H - h} width={bw} height={Math.max(h, 1)} rx={2} fill="#cfe1f1" />
              {e > 0 && <rect x={x} y={H - e} width={bw} height={Math.max(e, 2)} rx={2} fill="#dc2626" />}
              {c > 0 && <rect x={x} y={H - e - c} width={bw} height={Math.max(c, 2)} rx={2} fill="#f59e0b" />}
              {i % 4 === 0 && <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="#64748b">{new Date(d.hour).getHours()}h</text>}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#cfe1f1]" />Requests</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-red-600" />Server errors</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" />App errors on devices</span>
      </div>
    </div>
  );
}

function IncidentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["watch-incident", id], queryFn: () => watchService.incident(id) });
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: (input: { action?: "acknowledge" | "resolve" | "ignore" | "reopen"; note?: string }) => watchService.act(id, input),
    onSuccess: async () => { setNote(""); await qc.invalidateQueries({ queryKey: ["watch-incident", id] }); await qc.invalidateQueries({ queryKey: ["watch-overview"] }); await qc.invalidateQueries({ queryKey: ["watch-incidents"] }); },
    onError: () => toast({ variant: "destructive", title: "That did not work", description: "Please try again." }),
  });
  const i = q.data;
  const details = Object.entries(i?.details ?? {}).filter(([, v]) => v !== "" && v !== null && v !== undefined);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        {!i ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase ${SEV[i.severity].chip}`}>{SEV[i.severity].label}</span>
                <Badge variant="outline">{CATEGORY_LABEL[i.category] ?? i.category}</Badge>
                <Badge variant="secondary">{STATUS_LABEL[i.status]}</Badge>
              </div>
              <DialogTitle className="mt-2 text-xl leading-snug">{i.title}</DialogTitle>
              <DialogDescription>{i.message}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-4">
              {[["Happened", `${i.count}×`], ["People", String(i.affected_users)], ["Schools", String(i.affected_schools)], ["Alerts sent", String(i.alert_count)]].map(([k, v]) => (
                <div key={k} className="rounded-xl border p-3"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{k}</p><p className="text-2xl font-black text-primary">{v}</p></div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">First seen {when(i.first_seen)} · last seen {when(i.last_seen)} ({ago(i.last_seen)}){i.acknowledged_by ? ` · being handled by ${i.acknowledged_by}` : ""} · from {SOURCE_LABEL[i.source] ?? i.source}</p>
            {details.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-black">Details</h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {details.map(([k, v]) => (
                    <div key={k} className="grid gap-1 p-2.5 sm:grid-cols-[130px_1fr]"><dt className="text-xs font-bold capitalize text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                      <dd className={k === "stack" || k === "trail" ? "whitespace-pre-wrap break-words font-mono text-xs" : "break-words"}>{String(v)}</dd></div>
                  ))}
                </dl>
              </section>
            )}
            {!!i.schools?.length && (
              <section><h3 className="mb-1 text-sm font-black">Schools affected</h3><div className="flex flex-wrap gap-1.5">{i.schools.map((s) => <Badge key={s.id} variant="secondary">{s.name}</Badge>)}</div></section>
            )}
            {!!i.alerts?.length && (
              <section><h3 className="mb-1 text-sm font-black">Emails to the founders</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">{i.alerts.map((a, k) => <li key={k}><Mail className="mr-1 inline h-3.5 w-3.5" />{a.kind} · {when(a.sent_at)} · {a.delivered} of {a.to} delivered</li>)}</ul></section>
            )}
            <section>
              <h3 className="mb-1 text-sm font-black">Notes</h3>
              <ul className="space-y-2">
                {(i.notes ?? []).map((n, k) => <li key={k} className="rounded-lg bg-muted/50 p-2.5 text-sm"><span className="text-xs font-bold text-muted-foreground">{n.by} · {when(n.at)}</span><br />{n.text}</li>)}
                {!(i.notes ?? []).length && <li className="text-sm text-muted-foreground">No notes yet.</li>}
              </ul>
              <div className="mt-2 flex gap-2">
                <Input placeholder="Add a note for the team (what you found or did)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                <Button variant="outline" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ note })}>Add</Button>
              </div>
            </section>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {i.status === "open" && <Button disabled={act.isPending} onClick={() => act.mutate({ action: "acknowledge" })}>I am handling this</Button>}
              {(i.status === "open" || i.status === "acknowledged") && <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ action: "resolve" })}><CheckCircle2 className="mr-1.5 h-4 w-4" />Mark as resolved</Button>}
              {(i.status === "open" || i.status === "acknowledged") && <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ action: "ignore", note: note || "Not a real problem." })}>Ignore (stop alerts)</Button>}
              {(i.status === "resolved" || i.status === "ignored") && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "reopen" })}>Reopen</Button>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Watch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const params = useSearchParams();
  const founder = ["CEO", "CTO"].includes(String(user?.role || ""));
  const [tab, setTab] = useState<"incidents" | "traffic" | "alerts">("incidents");
  const [status, setStatus] = useState("active");
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string>(params.get("incident") || "");

  const overview = useQuery({ queryKey: ["watch-overview"], queryFn: watchService.overview, enabled: founder, refetchInterval: 30000 });
  const filters = useMemo(() => Object.fromEntries(Object.entries({ status, severity, category, q }).filter(([, v]) => v)) as Record<string, string>, [status, severity, category, q]);
  const incidents = useQuery({ queryKey: ["watch-incidents", filters], queryFn: () => watchService.incidents(filters), enabled: founder, refetchInterval: 30000 });
  const log = useQuery({ queryKey: ["watch-alert-log"], queryFn: watchService.alertLog, enabled: founder && tab === "alerts" });
  useEffect(() => { const id = params.get("incident"); if (id) setOpenId(id); }, [params]);

  const run = useMutation({
    mutationFn: watchService.runChecks,
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["watch-overview"] }); await qc.invalidateQueries({ queryKey: ["watch-incidents"] }); toast({ title: "Checks finished" }); },
  });
  const test = useMutation({
    mutationFn: watchService.testAlert,
    onSuccess: (r) => toast({ title: r.delivered ? "Test alert sent" : "The email provider did not accept the test", description: `${r.delivered} of ${r.recipients.length} delivered: ${r.recipients.join(", ")}` , variant: r.delivered ? undefined : "destructive" }),
    onError: (e: any) => toast({ variant: "destructive", title: "Could not send the test", description: e?.response?.data?.detail || "Try again." }),
  });

  if (!founder) return <p className="mx-auto max-w-xl p-10 text-center text-sm text-muted-foreground">Security &amp; System Watch is for the founders.</p>;
  const o = overview.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black text-primary sm:text-3xl"><ShieldAlert className="h-7 w-7" /> Security &amp; System Watch</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">EduIgnite watches itself, every school and every device. When something fails you see it here, and the CEO and CTO are emailed straight away about anything urgent, before anyone has to complain.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Run checks now</Button>
            <Button variant="outline" className="gap-2" disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send a test alert</Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {o ? <StatePill state={o.state} /> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {o && <span className="text-xs font-semibold text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5" />Checks last ran {ago(o.monitor_last_run)}</span>}
          {o && o.monitor_last_run && Date.now() - new Date(o.monitor_last_run).getTime() > 10 * 60 * 1000 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800">The scheduler seems to be stopped</span>}
        </div>
      </header>

      {o && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Critical open", o.open.critical, o.open.critical ? "text-red-600" : "text-emerald-600"],
            ["Warnings open", o.open.warning, o.open.warning ? "text-amber-600" : "text-emerald-600"],
            ["Security open", o.security_open, o.security_open ? "text-red-600" : "text-emerald-600"],
            ["Server errors (24 h)", o.series.reduce((n, h) => n + h.errors_5xx, 0), "text-primary"],
          ].map(([label, value, tone]) => (
            <Card key={String(label)} className="border-none shadow-sm"><CardContent className="p-4"><p className={`text-3xl font-black ${tone}`}>{value as number}</p><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></CardContent></Card>
          ))}
        </div>
      )}

      {o && (
        <section>
          <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-muted-foreground">System health</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{o.checks.map((c) => <CheckCard key={c.key} c={c} />)}</div>
        </section>
      )}

      <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist">
        {([["incidents", "Problems", Siren], ["traffic", "Traffic & schools", Activity], ["alerts", "Alerts to founders", Mail]] as const).map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${tab === key ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === "incidents" && (
        <Card className="border-none shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap gap-2">
              <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm font-semibold">
                <option value="active">Open and being handled</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option><option value="all">Everything</option>
              </select>
              <select aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm font-semibold">
                <option value="">Any severity</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
              </select>
              <select aria-label="Area" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm font-semibold">
                <option value="">Every area</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
              <Input className="max-w-xs" placeholder="Search a problem or school" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {incidents.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : null}
            {incidents.data && incidents.data.results.length === 0 && (
              <div className="rounded-2xl border border-dashed p-10 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-emerald-600" /><p className="mt-2 font-black">Nothing here</p><p className="text-sm text-muted-foreground">No problems match these filters. That is good news.</p></div>
            )}
            <ul className="divide-y rounded-2xl border">
              {incidents.data?.results.map((i: WatchIncident) => (
                <li key={i.id}>
                  <button type="button" onClick={() => setOpenId(i.id)} className="flex w-full items-stretch gap-3 p-3 text-left hover:bg-muted/40 sm:p-4">
                    <span className={`w-1.5 shrink-0 rounded-full ${SEV[i.severity].bar}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEV[i.severity].chip}`}>{SEV[i.severity].label}</span>
                        <span className="text-[11px] font-bold text-muted-foreground">{CATEGORY_LABEL[i.category] ?? i.category} · {SOURCE_LABEL[i.source] ?? i.source}</span>
                        {i.status !== "open" && <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[i.status]}</Badge>}
                      </span>
                      <span className="mt-1 block truncate text-sm font-black">{i.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.message}</span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <b className="block text-base text-primary">{i.count}×</b>{i.affected_users} people · {i.affected_schools} schools<br />{ago(i.last_seen)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {incidents.data && incidents.data.count > incidents.data.results.length && <p className="text-center text-xs text-muted-foreground">Showing the {incidents.data.results.length} most important of {incidents.data.count}. Use the filters to narrow down.</p>}
          </CardContent>
        </Card>
      )}

      {tab === "traffic" && o && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border-none shadow-sm">
            <CardHeader><CardTitle className="text-base">The last 24 hours</CardTitle><CardDescription>Every request to the platform, and how many failed.</CardDescription></CardHeader>
            <CardContent><TrafficChart data={o.series} /></CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader><CardTitle className="text-base">Schools with problems</CardTitle><CardDescription>Schools affected by an open problem.</CardDescription></CardHeader>
            <CardContent>
              {o.schools.length === 0 ? <p className="text-sm text-muted-foreground">No school is affected right now.</p> : (
                <ul className="divide-y">{o.schools.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="font-bold">{s.name}</span><span className="text-xs text-muted-foreground">{s.incidents} problem(s) · {s.events} events</span></li>)}</ul>
              )}
              <p className="mt-4 text-xs text-muted-foreground">Failed sign-ins in the last 24 hours: <b>{o.series.reduce((n, h) => n + h.login_failures, 0)}</b></p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "alerts" && o && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader><CardTitle className="text-base">Who is emailed</CardTitle><CardDescription>Every urgent problem is emailed to all of them, as soon as it is found.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {o.recipients.length === 0 ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">No founder has an email address that can receive alerts. Add one on the Staff page.</p> : (
                <ul className="divide-y rounded-xl border">{o.recipients.map((r) => <li key={r.email} className="flex items-center justify-between gap-3 p-3 text-sm"><span><b>{r.name}</b><br /><span className="text-xs text-muted-foreground">{r.email}</span></span><Badge variant="secondary">{r.role || "Extra"}</Badge></li>)}</ul>
              )}
              <div className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 font-black text-foreground">What triggers an email</p>
                A critical problem: the database, cache or disk failing, many server errors, sign-in or payment failures, an attack on sign-ins, a broken release on many devices, emails or AI failing, or the scheduler stopping. A repeat of the same problem is emailed again only if it gets much worse or after an hour. You also get a message when a critical problem recovers, and one morning summary of what is still open.
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader><CardTitle className="text-base">Recent alert emails</CardTitle></CardHeader>
            <CardContent>
              {log.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (log.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No alert has been sent yet. Use "Send a test alert" to check that emails reach you.</p> : (
                <ul className="divide-y text-sm">{(log.data ?? []).map((a, k) => <li key={k} className="py-2.5"><p className="font-bold">{a.subject}</p><p className="text-xs text-muted-foreground">{when(a.sent_at)} · {a.delivered} of {a.recipients.length} delivered</p></li>)}</ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {openId && <IncidentDetail id={openId} onClose={() => setOpenId("")} />}
    </div>
  );
}

export default function SystemWatchPage() {
  return <Suspense fallback={null}><Watch /></Suspense>;
}
