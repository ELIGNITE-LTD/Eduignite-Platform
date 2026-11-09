"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Headset, Inbox, Loader2, Lock, Search, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { customerCareService, type CareOverview, type StaffConversation } from "@/lib/api/services/customer-care.service";
import { STATUS_LABELS, STATUS_TONE, formatDateTime, pick } from "@/lib/customer-care-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AssignmentsPanel, AuditPanel, GroupsPanel } from "./founder-panels";
import { ContactManager } from "./contact-manager";
import { ChannelSettings } from "./channel-settings";
import { EMPTY_FILTERS, StaffFiltersPanel, activeFilterCount, toApiFilters, type StaffFilters } from "./staff-filters";
import { StaffDetail } from "./staff-detail";

const careKeys = { me: ["care", "me"], overview: ["care", "overview"], list: ["care", "list"], groups: ["care", "groups"], executives: ["care", "executives"] } as const;

/** /dashboard/customer-care: the staff side of Customer Care. The server enforces access; this mirrors it. */
export function CustomerCareDashboard() {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const me = useQuery({ queryKey: careKeys.me, queryFn: customerCareService.me, retry: 1 });

  if (me.isLoading) {
    return (
      <div className="space-y-4 p-1" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (me.isError) {
    return <LoadError message={t("Could not check your Customer Care access.", "Impossible de vérifier votre accès au Service Client.")} onRetry={() => me.refetch()} retrying={me.isFetching} />;
  }
  if (!me.data?.has_access) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
        <h1 className="mt-3 text-lg font-bold text-[#12314d]">{t("Customer Care is not enabled for your account", "Le Service Client n'est pas activé pour votre compte")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("Ask the CEO or CTO to grant you Customer Care access.", "Demandez au PDG ou au CTO de vous accorder l'accès au Service Client.")}</p>
      </div>
    );
  }

  const isFounder = Boolean(me.data.is_founder);
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#264D73] text-white"><Headset className="h-5 w-5" aria-hidden /></span>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#12314d]">{t("Customer Care", "Service Client")}</h1>
          <p className="text-xs text-slate-600">{t("Official EduIgnite support for schools, learners and partners.", "Support officiel EduIgnite pour les écoles, les apprenants et les partenaires.")}</p>
        </div>
      </header>

      {isFounder ? (
        <Tabs defaultValue="conversations" className="space-y-4">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="w-max">
              <TabsTrigger value="conversations">{t("Conversations", "Conversations")}</TabsTrigger>
              <TabsTrigger value="assignments">{t("Assignments", "Assignations")}</TabsTrigger>
              <TabsTrigger value="groups">{t("Groups", "Groupes")}</TabsTrigger>
              <TabsTrigger value="audit">{t("Audit log", "Journal d'audit")}</TabsTrigger>
              <TabsTrigger value="contact">{t("Contact information", "Coordonnées")}</TabsTrigger>
              <TabsTrigger value="channels">{t("Channels", "Canaux")}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="conversations" className="mt-0"><FounderConversations /></TabsContent>
          <TabsContent value="assignments" className="mt-0"><FounderAssignments /></TabsContent>
          <TabsContent value="groups" className="mt-0"><GroupsPanel /></TabsContent>
          <TabsContent value="audit" className="mt-0"><AuditPanel /></TabsContent>
          <TabsContent value="contact" className="mt-0"><ContactManager /></TabsContent>
          <TabsContent value="channels" className="mt-0"><ChannelSettings /></TabsContent>
        </Tabs>
      ) : (
        <Workspace isFounder={false} executives={null} />
      )}
    </div>
  );
}

function useExecutivesList(enabled: boolean) {
  return useQuery({ queryKey: careKeys.executives, queryFn: customerCareService.executives, enabled });
}

function FounderConversations() {
  const executives = useExecutivesList(true);
  return <Workspace isFounder executives={executives.data ?? null} />;
}

function FounderAssignments() {
  const executives = useExecutivesList(true);
  return <AssignmentsPanel executives={executives.data ?? null} />;
}

/* ------------------------------------------------------------- workspace */

function Workspace({ isFounder, executives }: { isFounder: boolean; executives: import("@/lib/api/services/customer-care.service").CareExecutive[] | null }) {
  const { language } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [filters, setFilters] = useState<StaffFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 350);
    return () => window.clearTimeout(id);
  }, [search]);
  useEffect(() => setPageSize(50), [filters, debounced]);

  const groups = useQuery({ queryKey: careKeys.groups, queryFn: customerCareService.groups });
  const overview = useQuery({ queryKey: careKeys.overview, queryFn: customerCareService.overview, refetchInterval: 30000 });
  const apiFilters = toApiFilters(filters, debounced);
  const list = useQuery({
    queryKey: [...careKeys.list, apiFilters, pageSize],
    queryFn: () => customerCareService.conversations({ ...apiFilters, page_size: pageSize }),
    refetchInterval: 20000,
    placeholderData: (prev) => prev,
  });

  const changed = useCallback(() => {
    void qc.invalidateQueries({ queryKey: careKeys.list });
    void qc.invalidateQueries({ queryKey: careKeys.overview });
  }, [qc]);

  const results = list.data?.results ?? [];
  const filterCount = activeFilterCount(filters);

  return (
    <div className="space-y-4">
      <OverviewCards data={overview.data} loading={overview.isLoading} error={overview.isError} onRetry={() => overview.refetch()} language={language} onPick={(patch) => { setFilters({ ...EMPTY_FILTERS, ...patch }); setSelected(null); }} />

      <div className="grid min-h-[34rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100dvh-19rem)] lg:min-h-[34rem] lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[15rem_21rem_minmax(0,1fr)]">
        <aside className="hidden overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-4 xl:block" aria-label={t("Filters", "Filtres")}>
          <StaffFiltersPanel filters={filters} onChange={setFilters} groups={groups.data || []} executives={isFounder ? executives : null} language={language} />
        </aside>

        {/* Conversation list */}
        <section className={cn("min-h-0 flex-col border-r border-slate-200", selected ? "hidden lg:flex" : "flex")} aria-label={t("Conversations", "Conversations")}>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search name, subject, message...", "Rechercher nom, objet, message...")} className="pl-8" aria-label={t("Search conversations", "Rechercher")} />
            </div>
            <div className="flex items-center justify-between gap-2 xl:hidden">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSheet(true)}>
                <SlidersHorizontal className="h-4 w-4" /> {t("Filters", "Filtres")}{filterCount ? ` (${filterCount})` : ""}
              </Button>
              <span className="text-xs text-slate-500">{list.data ? `${list.data.count} ${t("conversations", "conversations")}` : ""}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-3" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : list.isError ? (
              <div className="p-3"><LoadError message={t("Could not load conversations.", "Impossible de charger les conversations.")} onRetry={() => list.refetch()} retrying={list.isFetching} /></div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-500">
                <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
                {filterCount || debounced ? t("No conversation matches these filters.", "Aucune conversation ne correspond.") : t("No conversations yet.", "Aucune conversation pour l'instant.")}
              </div>
            ) : (
              <ul>
                {results.map((c) => <ConversationRow key={c.id} c={c} active={selected === c.id} language={language} onSelect={() => setSelected(c.id)} />)}
                {list.data && list.data.count > results.length && (
                  <li className="p-3 text-center">
                    <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + 50)} disabled={list.isFetching}>
                      {list.isFetching && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} {t("Load more", "Charger plus")}
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

        {/* Detail */}
        <section className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden lg:flex")} aria-label={t("Conversation", "Conversation")}>
          {selected ? (
            <StaffDetail
              key={selected}
              conversationId={selected}
              isFounder={isFounder}
              meId={user?.id ? String(user.id) : undefined}
              executives={executives}
              onBack={() => setSelected(null)}
              onChanged={changed}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-slate-500">
              <Headset className="h-10 w-10 text-slate-300" aria-hidden />
              {t("Select a conversation to read and reply.", "Sélectionnez une conversation pour lire et répondre.")}
            </div>
          )}
        </section>
      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
          <SheetHeader><SheetTitle>{t("Filters", "Filtres")}</SheetTitle></SheetHeader>
          <div className="mt-4">
            <StaffFiltersPanel filters={filters} onChange={setFilters} groups={groups.data || []} executives={isFounder ? executives : null} language={language} />
          </div>
          <Button className="mt-5 w-full" onClick={() => setSheet(false)}>{t("Show results", "Voir les résultats")}</Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConversationRow({ c, active, language, onSelect }: { c: StaffConversation; active: boolean; language: string; onSelect: () => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn("w-full border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-slate-50", active && "bg-sky-50")}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn("min-w-0 truncate text-sm", c.unread_count ? "font-bold text-slate-900" : "font-medium text-slate-800")}>{c.customer.name}</p>
          <span className="shrink-0 text-[10px] text-slate-500">{formatDateTime(c.last_activity_at, language)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-600">{c.subject}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", STATUS_TONE[c.status])}>{pick(language, STATUS_LABELS[c.status] as any)}</Badge>
          {c.group && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{c.group.slug}</span>}
          <span className="truncate text-[10px] text-slate-500">{c.assigned_to ? c.assigned_to.name : t("Unassigned", "Non assignée")}</span>
          {c.is_follow_up_overdue && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700"><CalendarClock className="h-3 w-3" aria-hidden />{t("Overdue", "En retard")}</span>}
          {c.unread_count > 0 && <span className="ml-auto rounded-full bg-[#264D73] px-1.5 text-[10px] font-bold text-white" aria-label={`${c.unread_count} ${t("unread", "non lus")}`}>{c.unread_count}</span>}
        </div>
      </button>
    </li>
  );
}

/* -------------------------------------------------------------- overview */

function OverviewCards({ data, loading, error, onRetry, language, onPick }: { data?: CareOverview; loading: boolean; error: boolean; onRetry: () => void; language: string; onPick: (patch: Partial<StaffFilters>) => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  if (error) return <LoadError message={t("Could not load the overview.", "Impossible de charger l'aperçu.")} onRetry={onRetry} />;
  const cards: Array<{ key: string; label: string; value?: number; patch?: Partial<StaffFilters>; tone?: string }> = [
    { key: "total", label: t("Total", "Total"), value: data?.total, patch: {} },
    { key: "new", label: t("New", "Nouvelles"), value: data?.new, patch: { status: "new" } },
    { key: "unassigned", label: t("Unassigned", "Non assignées"), value: data?.unassigned, patch: { assignee: "unassigned" } },
    { key: "open", label: t("Open", "Ouvertes"), value: data?.open, patch: { status: "open" } },
    { key: "awaiting", label: t("Awaiting response", "En attente de réponse"), value: data?.awaiting_customer, patch: { status: "awaiting_customer" } },
    { key: "resolved", label: t("Resolved", "Résolues"), value: data?.resolved, patch: { status: "resolved" } },
    { key: "overdue", label: t("Overdue follow-ups", "Suivis en retard"), value: data?.overdue_follow_ups, patch: { overdue: true }, tone: (data?.overdue_follow_ups ?? 0) > 0 ? "text-red-700" : undefined },
    { key: "execs", label: t("Active executives", "Exécutifs actifs"), value: data?.active_executives },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" data-testid="care-overview">
      {cards.map((card) => {
        const body = (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            {loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className={cn("mt-1 text-2xl font-extrabold tabular-nums text-[#12314d]", card.tone)}>{card.value ?? 0}</p>}
          </>
        );
        const cls = "rounded-xl border border-slate-200 bg-white p-3 text-left";
        return card.patch ? (
          <button key={card.key} type="button" onClick={() => onPick(card.patch!)} className={cn(cls, "transition-colors hover:border-[#67D0E4] hover:bg-sky-50/40")}>{body}</button>
        ) : (
          <div key={card.key} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}
