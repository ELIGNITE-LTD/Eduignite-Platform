"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { publicSiteService, type FounderSchoolRow } from "@/lib/api/services/public-site.service";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, Loader2, Lock, Unlock } from "lucide-react";
import { Section, StatusChip, publicSiteUrl, useTr } from "./shared";

const PAGE_SIZE = 25;

/** Founders (CEO/CTO): every school's website status, with force-unpublish and unlock. */
export function FounderSitesPanel() {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<{ row: FounderSchoolRow; action: "lock" | "unlock" } | null>(null);

  const query = useQuery({
    queryKey: PUBLIC_SITE_KEYS.founder(status, page),
    queryFn: () => publicSiteService.founderList({ status: status === "all" ? undefined : status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const act = useMutation({
    mutationFn: ({ row, action }: { row: FounderSchoolRow; action: "lock" | "unlock" }) =>
      action === "lock" ? publicSiteService.forceUnpublish(row.id) : publicSiteService.unlock(row.id),
    onSuccess: (_data, { action }) => {
      toast({ title: action === "lock" ? tr("Website forced offline and locked", "Site mis hors ligne et verrouille") : tr("Website unlocked", "Site deverrouille") });
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["public-site", "founder"] });
    },
    onError: (error) => toast({ variant: "destructive", title: tr("Action failed", "Echec de l'action"), description: getApiErrorMessage(error, "") }),
  });

  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // The API filters by status; name search narrows the loaded page.
  const needle = search.trim().toLowerCase();
  const rows = (query.data?.results ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.slug || "").includes(needle));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div>
        <h1 className="font-headline text-2xl font-bold text-primary sm:text-3xl">{tr("School Websites", "Sites web des ecoles")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("Publication status of every school. Forcing a website offline also locks it: the school cannot publish again until you unlock it.",
            "Etat de publication de chaque ecole. Mettre un site hors ligne le verrouille aussi : l'ecole ne peut plus le publier tant que vous ne le deverrouillez pas.")}
        </p>
      </div>

      <Section title={tr("Schools", "Ecoles")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label={tr("Search schools", "Rechercher une ecole")} placeholder={tr("Search by name on this page", "Rechercher par nom sur cette page")} value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
          <Select value={status} onValueChange={(next) => { setStatus(next); setPage(0); }}>
            <SelectTrigger className="sm:w-48" aria-label={tr("Filter by status", "Filtrer par etat")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("All statuses", "Tous les etats")}</SelectItem>
              <SelectItem value="published">{tr("Published", "Publie")}</SelectItem>
              <SelectItem value="draft">{tr("Draft", "Brouillon")}</SelectItem>
              <SelectItem value="unpublished">{tr("Unpublished", "Depublie")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {query.isError ? (
          <LoadError message={tr("Could not load schools.", "Impossible de charger les ecoles.")} onRetry={() => query.refetch()} retrying={query.isFetching} />
        ) : query.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr("Loading...", "Chargement...")}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("No schools match.", "Aucune ecole ne correspond.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("School", "Ecole")}</TableHead>
                  <TableHead>{tr("Status", "Etat")}</TableHead>
                  <TableHead>{tr("Lock", "Verrou")}</TableHead>
                  <TableHead className="text-right">{tr("Actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium">{row.name}</p>
                      {row.slug ? <p className="text-xs text-muted-foreground">/schools/{row.slug}</p> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip status={row.publication_status} live={row.is_live} />
                        {row.publication_status === "published" && !row.is_live ? (
                          <span className="text-xs text-amber-700">{tr("Not visible", "Non visible")}</span>
                        ) : null}
                        {row.kill_switch_on ? <span className="text-xs text-destructive">{tr("Public pages disabled", "Pages publiques desactivees")}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.locked_by_founder ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"><Lock className="h-3.5 w-3.5" />{tr("Locked", "Verrouille")}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.is_live && row.slug ? (
                          <Button size="sm" variant="ghost" asChild aria-label={tr("Open website", "Ouvrir le site")}>
                            <a href={publicSiteUrl(row.slug)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                          </Button>
                        ) : null}
                        {row.locked_by_founder ? (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setPending({ row, action: "unlock" })}><Unlock className="h-4 w-4" />{tr("Unlock", "Deverrouiller")}</Button>
                        ) : (
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => setPending({ row, action: "lock" })}><Lock className="h-4 w-4" />{tr("Force unpublish", "Forcer la depublication")}</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{tr(`Page ${page + 1} of ${pages}`, `Page ${page + 1} sur ${pages}`)} ({total})</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{tr("Previous", "Precedent")}</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{tr("Next", "Suivant")}</Button>
          </div>
        </div>
      </Section>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "lock" ? tr("Force this website offline?", "Forcer la mise hors ligne de ce site ?") : tr("Unlock this website?", "Deverrouiller ce site ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "lock"
                ? tr(`${pending.row.name} will go offline immediately and cannot publish again until you unlock it.`, `${pending.row.name} sera mis hors ligne immediatement et ne pourra plus publier tant que vous ne le deverrouillez pas.`)
                : tr(`${pending?.row.name} will be allowed to publish again. It stays offline until the school publishes it.`, `${pending?.row.name} pourra de nouveau publier. Le site reste hors ligne jusqu'a ce que l'ecole le publie.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={act.isPending} onClick={(e) => { e.preventDefault(); if (pending) act.mutate(pending); }}>
              {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("Confirm", "Confirmer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
