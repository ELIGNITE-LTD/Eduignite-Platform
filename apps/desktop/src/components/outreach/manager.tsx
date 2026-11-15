"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Search, Trash2, Upload, Repeat } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { outreachService, type OutreachContact } from "@/lib/api/services/outreach.service";
import { useI18n } from "@/lib/i18n-context";
import { useTr } from "@/components/school-website/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ContactDialog, ImportDialog } from "./contact-dialogs";
import { MessageBox } from "./message-box";
import { OutreachHistory } from "./history";
import { LEVELS, LevelBadge, REGION_FR, StatusBadge, formatDate } from "./shared";

const PAGE_SIZE = 25;

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-headline text-2xl font-semibold text-primary", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-headline text-lg font-semibold text-primary">{children}</h2>;
}

export function OutreachManager() {
  const tr = useTr();
  const { language } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const messageRef = useRef<HTMLDivElement>(null);

  const [region, setRegion] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"no" | "yes">("no");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<OutreachContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<OutreachContact | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any change of view starts a fresh selection on page 1.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [region, level, q, tab]);

  const filters = useMemo(() => ({ region, level, q, sent: tab }), [region, level, q, tab]);

  const summary = useQuery({ queryKey: ["outreach", "summary"], queryFn: outreachService.summary });
  const list = useQuery({
    queryKey: ["outreach", "contacts", filters, page],
    queryFn: () => outreachService.contacts({ ...filters, page, page_size: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["outreach"] });

  const remove = useMutation({
    mutationFn: (id: string) => outreachService.deleteContact(id),
    onSuccess: () => {
      setDeleting(null);
      toast({ title: tr("School removed", "Ecole supprimee") });
      refresh();
    },
    onError: (e) => {
      setDeleting(null);
      toast({ variant: "destructive", title: tr("Could not remove", "Suppression impossible"), description: getApiErrorMessage(e) });
    },
  });

  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllInView = async () => {
    setSelecting(true);
    try {
      const all = await outreachService.allContacts(filters);
      setSelected(new Set(all.map((c) => c.id)));
    } catch (e) {
      toast({ variant: "destructive", title: tr("Could not select all", "Selection impossible"), description: getApiErrorMessage(e) });
    } finally {
      setSelecting(false);
    }
  };

  const sendAgain = (c: OutreachContact) => {
    setSelected(new Set([c.id]));
    messageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast({ title: tr("Ready to send again", "Pret a renvoyer"), description: tr(`Write your message below to contact ${c.school_name} again.`, `Ecrivez votre message ci-dessous pour recontacter ${c.school_name}.`) });
  };

  const regionLabel = (r: { region: string; label: string }) => (language === "fr" ? REGION_FR[r.region] ?? r.label : r.label);
  const s = summary.data;
  const cap = s?.daily_cap ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-primary sm:text-3xl">{tr("Outreach", "Prospection")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("Find schools by region and level, and email them about EduIgnite.", "Trouvez des ecoles par region et niveau, et ecrivez-leur au sujet d'EduIgnite.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload className="mr-2 h-4 w-4" />{tr("Import CSV", "Importer CSV")}
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />{tr("Add school", "Ajouter une ecole")}
          </Button>
        </div>
      </header>

      {/* Stats */}
      <section className="space-y-3">
        {summary.isError ? (
          <LoadError message={tr("Could not load the numbers.", "Impossible de charger les chiffres.")} onRetry={() => summary.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {summary.isLoading || !s ? (
                [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
              ) : (
                <>
                  <Stat label={tr("Schools total", "Ecoles au total")} value={s.totals.total} />
                  <Stat label={tr("Not contacted", "Non contactees")} value={s.totals.not_contacted} />
                  <Stat label={tr("Contacted", "Contactees")} value={s.totals.contacted} tone="text-emerald-700" />
                  <Stat label={tr("Waiting to send", "En attente d'envoi")} value={s.queued} tone="text-amber-700" />
                </>
              )}
            </div>
            {s ? (
              <p className="text-sm text-muted-foreground">
                {tr(
                  `Sends up to ${s.daily_cap} emails per day, ${s.sent_today} sent today.`,
                  `Envoie jusqu'a ${s.daily_cap} emails par jour, ${s.sent_today} envoyes aujourd'hui.`,
                )}
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* Regions */}
      <section className="space-y-3">
        <SectionTitle>{tr("Regions", "Regions")}</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => setRegion("all")}
            aria-pressed={region === "all"}
            className={cn(
              "rounded-xl border p-3 text-left transition hover:border-primary/50",
              region === "all" ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card",
            )}
          >
            <p className="text-sm font-medium">{tr("All regions", "Toutes les regions")}</p>
            <p className="text-xs text-muted-foreground">{s ? `${s.totals.not_contacted} / ${s.totals.total}` : "-"}</p>
          </button>
          {(s?.regions ?? []).filter((r) => r.total > 0 || r.region !== "unknown").map((r) => (
            <button
              key={r.region}
              type="button"
              onClick={() => setRegion(r.region)}
              aria-pressed={region === r.region}
              className={cn(
                "rounded-xl border p-3 text-left transition hover:border-primary/50",
                region === r.region ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card",
              )}
            >
              <p className="truncate text-sm font-medium">{regionLabel(r)}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{r.not_contacted}</span> / {r.total}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{tr("Each card shows: not contacted / total.", "Chaque carte indique : non contactees / total.")}</p>
      </section>

      {/* List */}
      <section className="space-y-4">
        <SectionTitle>{tr("Schools", "Ecoles")}</SectionTitle>

        <div className="inline-flex w-full rounded-xl bg-muted p-1 sm:w-auto" role="tablist">
          {(["no", "yes"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none",
                tab === t ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "no" ? tr("Not contacted", "Non contactees") : tr("Already contacted", "Deja contactees")}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={tr("Search name, town or email", "Rechercher nom, ville ou email")}
              aria-label={tr("Search", "Rechercher")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="sm:w-48" aria-label={tr("Level", "Niveau")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("All levels", "Tous les niveaux")}</SelectItem>
              {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{tr(l.en, l.fr)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={selecting || total === 0} onClick={selectAllInView}>
            {selecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {tr(`Select all in this view (${total})`, `Tout selectionner dans cette vue (${total})`)}
          </Button>
          {selected.size > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{tr("Clear selection", "Effacer la selection")}</Button>
          ) : null}
          <span className="text-muted-foreground">{tr(`${selected.size} selected`, `${selected.size} selectionnees`)}</span>
        </div>

        {list.isError ? (
          <LoadError message={tr("Could not load the schools.", "Impossible de charger les ecoles.")} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {tr("No school matches. Add one or import a CSV file.", "Aucune ecole ne correspond. Ajoutez-en une ou importez un fichier CSV.")}
          </p>
        ) : (
          <div className={cn("overflow-hidden rounded-2xl border bg-card", list.isFetching && "opacity-70")}>
            <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <Checkbox
                checked={pageAllSelected}
                aria-label={tr("Select this page", "Selectionner cette page")}
                onCheckedChange={(v) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    rows.forEach((r) => (v ? next.add(r.id) : next.delete(r.id)));
                    return next;
                  })
                }
              />
              {tr("This page", "Cette page")}
            </div>
            <ul className="divide-y">
              {rows.map((c) => (
                <li key={c.id} className="flex items-start gap-3 p-4">
                  <Checkbox className="mt-1" checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={c.school_name} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.school_name}</p>
                      <LevelBadge level={c.level} tr={tr} />
                      <StatusBadge status={c.status} tr={tr} />
                    </div>
                    <p className="break-all text-sm text-muted-foreground">
                      {c.town ? `${c.town} - ` : ""}{c.email}
                    </p>
                    {tab === "yes" ? (
                      <p className="text-xs text-muted-foreground">
                        {tr("Contacted on", "Contactee le")} {formatDate(c.last_sent_at ?? c.first_sent_at, language)} - {c.sent_count} {c.sent_count === 1 ? tr("time", "fois") : tr("times", "fois")}
                      </p>
                    ) : null}
                    {c.status === "failed" && c.last_error ? <p className="text-xs text-red-700">{c.last_error}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {tab === "yes" ? (
                      <Button variant="outline" size="sm" onClick={() => sendAgain(c)} disabled={c.status === "unsubscribed" || c.status === "bounced"}>
                        <Repeat className="mr-1.5 h-3.5 w-3.5" />{tr("Send again", "Renvoyer")}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="icon" aria-label={tr("Edit", "Modifier")} onClick={() => setEditing(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={tr("Delete", "Supprimer")} onClick={() => setDeleting(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />{tr("Previous", "Precedent")}
              </Button>
              <span className="text-muted-foreground">{page} / {pages}</span>
              <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {tr("Next", "Suivant")}<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Message */}
      <section ref={messageRef} className="scroll-mt-4 space-y-3">
        <SectionTitle>{tr("Your message", "Votre message")}</SectionTitle>
        <Card className="rounded-2xl border shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <MessageBox
              subject={subject}
              body={body}
              onSubject={setSubject}
              onBody={setBody}
              selectedIds={Array.from(selected)}
              resend={tab === "yes"}
              dailyCap={cap}
              waiting={s?.queued ?? 0}
              onChanged={refresh}
              onSent={() => setSelected(new Set())}
            />
          </CardContent>
        </Card>
      </section>

      {/* History */}
      <section className="space-y-3">
        <SectionTitle>{tr("History", "Historique")}</SectionTitle>
        <OutreachHistory />
      </section>

      <ContactDialog open={adding || !!editing} contact={editing} onClose={() => { setAdding(false); setEditing(null); }} onSaved={refresh} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={refresh} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Remove this school?", "Supprimer cette ecole ?")}</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.school_name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}>
              {tr("Remove", "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
