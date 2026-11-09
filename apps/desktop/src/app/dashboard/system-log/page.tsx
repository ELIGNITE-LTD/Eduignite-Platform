"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { apiClient } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, Download, Loader2, Lock, RefreshCw, ScrollText, ShieldAlert, Users } from "lucide-react";

/**
 * System log: everything the executives do, with date and time, for the CEO and
 * the CTO only (equal rights). The server enforces this; the page only
 * mirrors it. Times are shown in Douala time (Africa/Douala).
 */

const TZ = "Africa/Douala";
const ENDPOINT = "/platform/executive-activity/";
const ALL = "all";

type LogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  actor_department: string;
  module: string;
  module_label: string;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  summary: string;
  outcome: "success" | "denied" | "failed" | "error";
  method: string;
  status_code: number | null;
  ip_address: string;
};

type Summary = {
  today: number;
  last_7_days: number;
  denied_last_7_days: number;
  most_active_executive: { id: string; name: string; department: string; count: number } | null;
  per_executive: { id: string; name: string; role: string; department: string; count: number; denied: number }[];
  per_module: { module: string; label: string; count: number }[];
};

const ACTIONS = [
  "login", "login_failed", "logout", "create", "update", "delete", "approve", "reject", "send",
  "publish", "export", "view_sensitive", "config_change", "password_change", "suspend", "restore",
];

const T = {
  title: { en: "System Log", fr: "Journal du système" },
  subtitle: {
    en: "Every activity carried out by the executives, with date and time, for accountability.",
    fr: "Toutes les activités des cadres, avec date et heure, pour la redevabilité.",
  },
  today: { en: "Activities today", fr: "Activités aujourd'hui" },
  week: { en: "Last 7 days", fr: "7 derniers jours" },
  mostActive: { en: "Most active (7 days)", fr: "Plus actif (7 jours)" },
  denied: { en: "Denied attempts (7 days)", fr: "Tentatives refusées (7 jours)" },
  search: { en: "Search name, target, summary, IP", fr: "Rechercher nom, cible, résumé, IP" },
  allModules: { en: "All modules", fr: "Tous les modules" },
  allActions: { en: "All actions", fr: "Toutes les actions" },
  allResults: { en: "All results", fr: "Tous les résultats" },
  success: { en: "Success", fr: "Réussi" },
  deniedLabel: { en: "Denied", fr: "Refusé" },
  failed: { en: "Failed", fr: "Échoué" },
  error: { en: "Error", fr: "Erreur" },
  from: { en: "From", fr: "Du" },
  to: { en: "To", fr: "Au" },
  everyone: { en: "Everyone", fr: "Tous" },
  when: { en: "Date and time", fr: "Date et heure" },
  who: { en: "Executive", fr: "Cadre" },
  module: { en: "Module", fr: "Module" },
  action: { en: "Action", fr: "Action" },
  target: { en: "Target", fr: "Cible" },
  result: { en: "Result", fr: "Résultat" },
  ip: { en: "IP", fr: "IP" },
  export: { en: "Export CSV", fr: "Exporter CSV" },
  autoRefresh: { en: "Auto-refresh", fr: "Actualisation auto" },
  refresh: { en: "Refresh", fr: "Actualiser" },
  empty: { en: "No activity matches these filters yet.", fr: "Aucune activité ne correspond à ces filtres." },
  loadError: { en: "The log could not be loaded.", fr: "Le journal n'a pas pu être chargé." },
  restricted: {
    en: "The system log is available to the CEO and the CTO only.",
    fr: "Le journal du système est réservé au PDG et au DTO.",
  },
  prev: { en: "Previous", fr: "Précédent" },
  next: { en: "Next", fr: "Suivant" },
  page: { en: "Page", fr: "Page" },
  timezone: { en: "Times shown in Douala time", fr: "Heures affichées à l'heure de Douala" },
} as const;

const OUTCOME_STYLE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
  failed: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

function formatDateTime(iso: string, lang: string) {
  try {
    return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
      timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function relativeTime(iso: string, lang: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];
  const rtf = new Intl.RelativeTimeFormat(lang === "fr" ? "fr" : "en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}

function prettyAction(action: string) {
  return action.replace(/_/g, " ");
}

export default function SystemLogPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const lang = language === "fr" ? "fr" : "en";
  const tr = (k: keyof typeof T) => T[k][lang];

  const role = String(user?.role || "").toUpperCase();
  const isFounder = role === "CEO" || role === "CTO";

  const [q, setQ] = useState("");
  const [executive, setExecutive] = useState("");
  const [moduleKey, setModuleKey] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [auto, setAuto] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, page_size: 25 };
    if (q.trim()) p.q = q.trim();
    if (executive) p.executive = executive;
    if (moduleKey !== ALL) p.module = moduleKey;
    if (action !== ALL) p.action = action;
    if (status !== ALL) p.status = status;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [q, executive, moduleKey, action, status, from, to, page]);

  const list = useQuery({
    queryKey: ["executive-activity", params],
    queryFn: async () => (await apiClient.get(ENDPOINT, { params })).data as { count: number; has_next: boolean; results: LogRow[] },
    enabled: isFounder,
    refetchInterval: auto ? 15000 : false,
    placeholderData: (prev) => prev,
  });
  const summary = useQuery({
    queryKey: ["executive-activity-summary"],
    queryFn: async () => (await apiClient.get(`${ENDPOINT}summary/`)).data as Summary,
    enabled: isFounder,
    refetchInterval: auto ? 15000 : false,
  });

  if (!isFounder) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <Lock className="h-5 w-5" /> {tr("restricted")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = list.data?.results ?? [];
  const count = list.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / 25));
  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  const download = async () => {
    setExporting(true);
    setExportError("");
    try {
      const { page: _p, page_size: _s, ...filters } = params;
      const res = await apiClient.get(`${ENDPOINT}export/`, { params: filters, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `system-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      summary.refetch();
      list.refetch();
    } catch (e) {
      setExportError(getApiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const cards = [
    { label: tr("today"), value: summary.data?.today ?? "-", icon: Activity },
    { label: tr("week"), value: summary.data?.last_7_days ?? "-", icon: ScrollText },
    {
      label: tr("mostActive"),
      value: summary.data?.most_active_executive ? summary.data.most_active_executive.name : "-",
      hint: summary.data?.most_active_executive
        ? `${summary.data.most_active_executive.department} · ${summary.data.most_active_executive.count}`
        : "",
      icon: Users,
    },
    { label: tr("denied"), value: summary.data?.denied_last_7_days ?? "-", icon: ShieldAlert },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ScrollText className="h-6 w-6" /> {tr("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{tr("subtitle")}</p>
          <p className="text-xs text-muted-foreground">{tr("timezone")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            {tr("autoRefresh")}
          </label>
          <Button variant="outline" size="sm" onClick={() => { list.refetch(); summary.refetch(); }}>
            <RefreshCw className={cn("mr-1 h-4 w-4", list.isFetching && "animate-spin")} /> {tr("refresh")}
          </Button>
          <Button size="sm" onClick={download} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            {tr("export")}
          </Button>
        </div>
      </div>
      {exportError ? <p className="text-sm text-red-600">{exportError}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="truncate text-xl font-bold sm:text-2xl">{c.value}</div>
              {"hint" in c && c.hint ? <div className="truncate text-xs text-muted-foreground">{c.hint}</div> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={executive === "" ? "default" : "outline"} onClick={() => { setExecutive(""); setPage(1); }}>
          {tr("everyone")}
        </Button>
        {(summary.data?.per_executive ?? []).map((e) => (
          <Button
            key={e.id}
            size="sm"
            variant={executive === e.id ? "default" : "outline"}
            onClick={() => { setExecutive(executive === e.id ? "" : e.id); setPage(1); }}
          >
            {e.name} <span className="ml-1 text-xs opacity-70">({e.count})</span>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input className="lg:col-span-2" placeholder={tr("search")} value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          <Select value={moduleKey} onValueChange={reset(setModuleKey)}>
            <SelectTrigger><SelectValue placeholder={tr("allModules")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tr("allModules")}</SelectItem>
              {(summary.data?.per_module ?? []).map((m) => (
                <SelectItem key={m.module} value={m.module}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={reset(setAction)}>
            <SelectTrigger><SelectValue placeholder={tr("allActions")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tr("allActions")}</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{prettyAction(a)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={reset(setStatus)}>
            <SelectTrigger><SelectValue placeholder={tr("allResults")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tr("allResults")}</SelectItem>
              <SelectItem value="success">{tr("success")}</SelectItem>
              <SelectItem value="denied">{tr("deniedLabel")}</SelectItem>
              <SelectItem value="failed">{tr("failed")}</SelectItem>
              <SelectItem value="error">{tr("error")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
            <Input type="date" aria-label={tr("from")} value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
            <Input type="date" aria-label={tr("to")} value={to} onChange={(e) => reset(setTo)(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {list.isError ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-red-600">
            <AlertTriangle className="h-5 w-5" /> {tr("loadError")} {getApiErrorMessage(list.error)}
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => list.refetch()}>{tr("refresh")}</Button>
          </CardContent>
        </Card>
      ) : list.isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{tr("empty")}</CardContent></Card>
      ) : (
        <>
          {/* Wide screens: table */}
          <Card className="hidden md:block">
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{tr("when")}</th>
                    <th className="px-3 py-2">{tr("who")}</th>
                    <th className="px-3 py-2">{tr("module")}</th>
                    <th className="px-3 py-2">{tr("action")}</th>
                    <th className="px-3 py-2">{tr("target")}</th>
                    <th className="px-3 py-2">{tr("result")}</th>
                    <th className="px-3 py-2">{tr("ip")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-top" title={r.summary}>
                      <td className="whitespace-nowrap px-3 py-2" title={relativeTime(r.created_at, lang)}>
                        {formatDateTime(r.created_at, lang)}
                        <div className="text-xs text-muted-foreground">{relativeTime(r.created_at, lang)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.actor_name}</div>
                        <div className="text-xs text-muted-foreground">{r.actor_department}</div>
                      </td>
                      <td className="px-3 py-2">{r.module_label}</td>
                      <td className="px-3 py-2 capitalize">{prettyAction(r.action)}</td>
                      <td className="px-3 py-2">
                        <div>{r.target_label || r.target_type || "-"}</div>
                        {r.target_id ? <div className="max-w-[10rem] truncate text-xs text-muted-foreground">{r.target_id}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={cn("capitalize", OUTCOME_STYLE[r.outcome])} variant="secondary">
                          {r.outcome}{r.status_code ? ` · ${r.status_code}` : ""}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.ip_address || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Phones: stacked cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-1 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.actor_name}</span>
                    <Badge className={cn("capitalize", OUTCOME_STYLE[r.outcome])} variant="secondary">{r.outcome}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.actor_department}</div>
                  <div>
                    <span className="capitalize">{prettyAction(r.action)}</span> · {r.module_label}
                    {r.target_label || r.target_type ? ` · ${r.target_label || r.target_type}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(r.created_at, lang)} ({relativeTime(r.created_at, lang)})
                    {r.ip_address ? ` · ${r.ip_address}` : ""}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {count} · {tr("page")} {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> {tr("prev")}
              </Button>
              <Button size="sm" variant="outline" disabled={!list.data?.has_next} onClick={() => setPage(page + 1)}>
                {tr("next")} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
