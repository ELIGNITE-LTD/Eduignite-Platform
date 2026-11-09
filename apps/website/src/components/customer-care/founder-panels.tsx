"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus, UserMinus } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import {
  careErrorDetail,
  customerCareService,
  type CareExecutive,
  type CareGroup,
} from "@/lib/api/services/customer-care.service";
import { formatDateTime } from "@/lib/customer-care-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const groupsKey = ["care", "groups"] as const;
const executivesKey = ["care", "executives"] as const;

/* ------------------------------------------------------------ assignments */

/**
 * Founders: which executives handle which customer group, and who holds each
 * open conversation. Only executives who have Customer Care access can be
 * picked (the server rejects anyone else). Individual conversations are
 * assigned from the conversation itself ("Assign" / "Reassign").
 */
export function AssignmentsPanel({ executives }: { executives: CareExecutive[] | null }) {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: groupsKey, queryFn: customerCareService.groups });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<{ group: CareGroup; assignmentId: string; name: string } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: groupsKey });
    void qc.invalidateQueries({ queryKey: executivesKey });
  };
  const add = useMutation({
    mutationFn: ({ groupId, executiveId }: { groupId: string; executiveId: string }) => customerCareService.assignGroup(groupId, executiveId),
    onSuccess: () => { refresh(); toast({ title: t("Executive assigned to the group", "Exécutif assigné au groupe") }); },
    onError: (e) => toast({ variant: "destructive", title: t("Could not assign", "Assignation impossible"), description: careErrorDetail(e) }),
  });
  const remove = useMutation({
    mutationFn: ({ groupId, assignmentId }: { groupId: string; assignmentId: string }) => customerCareService.unassignGroup(groupId, assignmentId),
    onSuccess: () => { setRemoving(null); refresh(); toast({ title: t("Assignment ended", "Assignation terminée") }); },
    onError: (e) => toast({ variant: "destructive", title: t("Could not remove", "Retrait impossible"), description: careErrorDetail(e) }),
  });

  if (groups.isLoading) return <Skeleton className="h-48 w-full" />;
  if (groups.isError) return <LoadError message={t("Could not load the groups.", "Impossible de charger les groupes.")} onRetry={() => groups.refetch()} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {t(
          "Assign executives to customer groups. An executive sees conversations assigned to them plus unassigned ones in their groups. To assign one conversation, open it and use Assign / Reassign.",
          "Assignez des exécutifs aux groupes de clients. Un exécutif voit ses conversations et celles non assignées de ses groupes. Pour assigner une conversation, ouvrez-la et utilisez Assigner / Réassigner.",
        )}
      </p>
      {executives && executives.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {t("No executive has Customer Care access yet. Grant it with 'Grant Customer Care Access' on the Founders page.", "Aucun exécutif n'a l'accès Service Client. Accordez-le avec « Accorder l'accès au Service Client » dans la page Fondateurs.")}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(groups.data || []).map((g) => {
          const assignedIds = new Set((g.executives || []).map((a) => a.executive?.id));
          const available = (executives || []).filter((e) => !assignedIds.has(e.id));
          return (
            <Card key={g.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="min-w-0 break-words">{g.name}</span>
                  {!g.is_active && <Badge variant="outline">{t("Inactive", "Inactif")}</Badge>}
                </CardTitle>
                {g.description && <p className="text-xs text-slate-600">{g.description}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5">
                  {(g.executives || []).length === 0 && <li className="text-sm text-slate-500">{t("No executive assigned.", "Aucun exécutif assigné.")}</li>}
                  {(g.executives || []).map((a) => (
                    <li key={a.assignment_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                      <span className="min-w-0 truncate">{a.executive?.name} <span className="text-xs text-slate-500">({a.executive?.role_label})</span></span>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("Remove", "Retirer")} onClick={() => setRemoving({ group: g, assignmentId: a.assignment_id, name: a.executive?.name || "" })}>
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Select value={pick[g.id] || ""} onValueChange={(v) => setPick((p) => ({ ...p, [g.id]: v }))} disabled={!available.length}>
                    <SelectTrigger aria-label={t("Executive to add", "Exécutif à ajouter")}><SelectValue placeholder={available.length ? t("Select an executive", "Choisir un exécutif") : t("None available", "Aucun disponible")} /></SelectTrigger>
                    <SelectContent>
                      {available.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.role_label})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button disabled={!pick[g.id] || add.isPending} onClick={() => { add.mutate({ groupId: g.id, executiveId: pick[g.id] }); setPick((p) => ({ ...p, [g.id]: "" })); }} className="gap-1">
                    <Plus className="h-4 w-4" /> {t("Add", "Ajouter")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("Executives with Customer Care access", "Exécutifs avec accès au Service Client")}</CardTitle></CardHeader>
        <CardContent>
          {!executives ? <Skeleton className="h-16 w-full" /> : executives.length === 0 ? (
            <p className="text-sm text-slate-500">{t("None yet.", "Aucun pour l'instant.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {executives.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">{e.name} <span className="text-xs text-slate-500">({e.role_label})</span></span>
                  <Badge variant="secondary">{e.open_conversations} {t("open", "ouvertes")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Remove from group?", "Retirer du groupe ?")}</DialogTitle>
            <DialogDescription>
              {removing ? t(`${removing.name} will no longer receive unassigned conversations of ${removing.group.name}. History is kept.`, `${removing.name} ne recevra plus les conversations non assignées de ${removing.group.name}. L'historique est conservé.`) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>{t("Cancel", "Annuler")}</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => removing && remove.mutate({ groupId: removing.group.id, assignmentId: removing.assignmentId })}>
              {remove.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Remove", "Retirer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------------------------------------- groups */

type GroupDraft = { id?: string; slug: string; name: string; description: string; is_active: boolean; sort_order: string };

export function GroupsPanel() {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: groupsKey, queryFn: customerCareService.groups });
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const save = useMutation({
    mutationFn: (d: GroupDraft) => {
      const payload = { name: d.name.trim(), description: d.description.trim(), is_active: d.is_active, sort_order: Number(d.sort_order) || 100 };
      return d.id ? customerCareService.updateGroup(d.id, payload) : customerCareService.createGroup({ ...payload, slug: d.slug.trim().toUpperCase(), rule_roles: [] });
    },
    onSuccess: () => { setDraft(null); void qc.invalidateQueries({ queryKey: groupsKey }); toast({ title: t("Group saved", "Groupe enregistré") }); },
    onError: (e) => toast({ variant: "destructive", title: t("Could not save the group", "Groupe non enregistré"), description: careErrorDetail(e) }),
  });

  if (groups.isLoading) return <Skeleton className="h-40 w-full" />;
  if (groups.isError) return <LoadError message={t("Could not load the groups.", "Impossible de charger les groupes.")} onRetry={() => groups.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{t("Customer groups decide who handles a new conversation. A: schools & school users, B: learners & students, C: partners.", "Les groupes décident qui traite une nouvelle conversation. A : écoles, B : apprenants, C : partenaires.")}</p>
        <Button size="sm" className="shrink-0 gap-1" onClick={() => setDraft({ slug: "", name: "", description: "", is_active: true, sort_order: "100" })}><Plus className="h-4 w-4" />{t("New group", "Nouveau groupe")}</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">{t("Group", "Groupe")}</th><th className="p-3">{t("Description", "Description")}</th><th className="p-3">{t("Roles", "Rôles")}</th><th className="p-3">{t("Status", "Statut")}</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(groups.data || []).map((g) => (
              <tr key={g.id}>
                <td className="p-3 font-semibold">{g.slug} - {g.name}</td>
                <td className="p-3 text-slate-600">{g.description}</td>
                <td className="p-3 text-xs text-slate-600">{(g.rule_roles || []).join(", ") || "-"}</td>
                <td className="p-3">{g.is_active ? <Badge variant="secondary">{t("Active", "Actif")}</Badge> : <Badge variant="outline">{t("Inactive", "Inactif")}</Badge>}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setDraft({ id: g.id, slug: g.slug, name: g.name, description: g.description || "", is_active: g.is_active, sort_order: String(g.sort_order) })}>{t("Edit", "Modifier")}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? t("Edit group", "Modifier le groupe") : t("New group", "Nouveau groupe")}</DialogTitle><DialogDescription>{t("Which roles belong to a group is decided by the system rules.", "Les rôles de chaque groupe sont décidés par les règles du système.")}</DialogDescription></DialogHeader>
          {draft && (
            <div className="space-y-3">
              {!draft.id && (
                <div className="space-y-1.5"><Label htmlFor="grp-slug" className="text-xs">{t("Short code (e.g. D)", "Code court (ex. D)")}</Label><Input id="grp-slug" value={draft.slug} maxLength={10} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></div>
              )}
              <div className="space-y-1.5"><Label htmlFor="grp-name" className="text-xs">{t("Name", "Nom")}</Label><Input id="grp-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="grp-desc" className="text-xs">{t("Description", "Description")}</Label><Input id="grp-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="grp-order" className="text-xs">{t("Order", "Ordre")}</Label><Input id="grp-order" type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />{t("Active", "Actif")}</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t("Cancel", "Annuler")}</Button>
            <Button disabled={!draft || !draft.name.trim() || (!draft.id && !draft.slug.trim()) || save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Save", "Enregistrer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ audit */

const AUDIT_ACTIONS = [
  "conversation_assigned", "group_assigned", "group_unassigned", "group_created", "group_updated",
  "contact_info_created", "contact_info_updated", "contact_info_deleted",
  "customer_care_access_granted", "customer_care_access_revoked",
];

export function AuditPanel() {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");
  const audit = useQuery({
    queryKey: ["care", "audit", page, action],
    queryFn: () => customerCareService.audit({ page, ...(action !== "all" ? { action } : {}) }),
  });
  const totalPages = audit.data ? Math.max(1, Math.ceil(audit.data.count / 25)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="w-[260px]" aria-label={t("Filter by action", "Filtrer par action")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All actions", "Toutes les actions")}</SelectItem>
            {AUDIT_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {audit.isLoading ? <Skeleton className="h-48 w-full" /> : audit.isError ? (
        <LoadError message={t("Could not load the audit log.", "Impossible de charger le journal.")} onRetry={() => audit.refetch()} />
      ) : (audit.data?.results.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("No entries.", "Aucune entrée.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">{t("When", "Quand")}</th><th className="p-3">{t("Who", "Qui")}</th><th className="p-3">{t("Action", "Action")}</th><th className="p-3">{t("Detail", "Détail")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {audit.data!.results.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap p-3 text-xs text-slate-600">{formatDateTime(a.created_at, language)}</td>
                  <td className="p-3">{a.actor?.name || "-"}</td>
                  <td className="p-3 font-medium">{a.action.replace(/_/g, " ")}</td>
                  <td className="max-w-[18rem] truncate p-3 text-xs text-slate-600" title={JSON.stringify(a.data || {})}>{a.target_type} {Object.entries(a.data || {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t("Previous page", "Page précédente")}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-xs text-slate-600">{page} / {totalPages}</span>
        <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label={t("Next page", "Page suivante")}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
