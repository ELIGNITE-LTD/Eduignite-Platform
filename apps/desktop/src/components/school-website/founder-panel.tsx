"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { publicSiteService, extractFieldErrors, type OversightSchoolRow } from "@/lib/api/services/public-site.service";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExternalLink, History, Loader2, MoreHorizontal } from "lucide-react";
import { Section, StatusChip, formatDateTime, publicSiteUrl, useTr } from "./shared";
import { ReasonDialog, type OversightDialogKind } from "./reason-dialog";
import { OversightTimelineList } from "./oversight-timeline";

const PAGE_SIZE = 25;

/**
 * Everyone holding the school_websites module (CEO/CTO always): every school's
 * website state, with block / unblock / publish / unpublish, each asking for a
 * reason first, and a timeline of what was done and why.
 */
export function FounderSitesPanel() {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<{ row: OversightSchoolRow; kind: OversightDialogKind } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [timelineFor, setTimelineFor] = useState<OversightSchoolRow | null>(null);
  const needle = search.trim();

  const query = useQuery({
    queryKey: ["public-site", "oversight", status, page, needle],
    queryFn: () =>
      publicSiteService.oversightList({ status: status === "all" ? undefined : status, q: needle || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const timeline = useQuery({
    queryKey: PUBLIC_SITE_KEYS.oversightTimeline(timelineFor?.id ?? ""),
    queryFn: () => publicSiteService.oversightTimeline(timelineFor!.id),
    enabled: Boolean(timelineFor),
  });

  const act = useMutation({
    mutationFn: ({ row, kind, reason, steps }: { row: OversightSchoolRow; kind: OversightDialogKind; reason: string; steps: string }) =>
      publicSiteService.oversightAct(row.id, kind, { reason, ...(kind === "block" || kind === "resolution" ? { resolution_steps: steps } : {}) }),
    onSuccess: (_data, { kind }) => {
      const done = {
        block: tr("Website blocked. The school was notified.", "Site bloque. L'ecole a ete prevenue."),
        unblock: tr("Website unblocked. The school was notified.", "Site debloque. L'ecole a ete prevenue."),
        resolution: tr("Steps updated. The school was notified.", "Etapes mises a jour. L'ecole a ete prevenue."),
        publish: tr("Website published.", "Site publie."),
        unpublish: tr("Website taken offline.", "Site mis hors ligne."),
      }[kind];
      toast({ title: done });
      setPending(null);
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ["public-site"] });
    },
    onError: (error) => {
      const fields = extractFieldErrors(error);
      setErrors(Object.keys(fields).length ? fields : { detail: getApiErrorMessage(error, tr("Action failed", "Echec de l'action")) });
    },
  });

  const open = (row: OversightSchoolRow, kind: OversightDialogKind) => {
    setErrors({});
    setPending({ row, kind });
  };

  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = query.data?.results ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div>
        <h1 className="font-headline text-2xl font-bold text-primary sm:text-3xl">{tr("School Websites", "Sites web des ecoles")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr(
            "Status of every school website. Blocking takes a site offline and keeps its previous state: unblocking brings a published site back live. Every action asks for a reason and tells the school administrators by email and in the app.",
            "Etat du site de chaque ecole. Bloquer met un site hors ligne en gardant son etat precedent : le debloquer remet en ligne un site publie. Chaque action demande un motif et previent les administrateurs de l'ecole par email et dans l'application.",
          )}
        </p>
      </div>

      <Section title={tr("Schools", "Ecoles")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label={tr("Search schools", "Rechercher une ecole")} placeholder={tr("Search by school name or code", "Rechercher par nom ou code")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="sm:max-w-xs" />
          <Select value={status} onValueChange={(next) => { setStatus(next); setPage(0); }}>
            <SelectTrigger className="sm:w-48" aria-label={tr("Filter by status", "Filtrer par etat")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("All statuses", "Tous les etats")}</SelectItem>
              <SelectItem value="blocked">{tr("Blocked", "Bloque")}</SelectItem>
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
                        <StatusChip status={row.publication_status} live={row.is_live} blocked={row.blocked} />
                        {row.blocked && row.case ? (
                          <span className="text-xs text-muted-foreground">
                            {tr("was", "etait")} {row.case.previous_status}, {formatDateTime(row.case.blocked_at)}
                          </span>
                        ) : null}
                        {!row.blocked && row.publication_status === "published" && !row.is_live ? (
                          <span className="text-xs text-amber-700">{tr("Not visible", "Non visible")}</span>
                        ) : null}
                        {row.kill_switch_on ? <span className="text-xs text-destructive">{tr("Public pages disabled", "Pages publiques desactivees")}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.is_live && row.slug ? (
                          <Button size="sm" variant="ghost" asChild aria-label={tr("Open website", "Ouvrir le site")}>
                            <a href={publicSiteUrl(row.slug)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => setTimelineFor(row)}><History className="h-4 w-4" />{tr("Timeline", "Historique")}</Button>
                        {row.blocked ? (
                          <Button size="sm" variant="outline" onClick={() => open(row, "unblock")}>{tr("Unblock", "Debloquer")}</Button>
                        ) : (
                          <Button size="sm" variant="destructive" onClick={() => open(row, "block")}>{tr("Block", "Bloquer")}</Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" aria-label={tr("More actions", "Plus d'actions")}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {row.blocked ? (
                              <DropdownMenuItem onClick={() => open(row, "resolution")}>{tr("Update steps for the school", "Mettre a jour les etapes")}</DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem disabled={row.publication_status === "published"} onClick={() => open(row, "publish")}>{tr("Publish on behalf", "Publier au nom de l'ecole")}</DropdownMenuItem>
                                <DropdownMenuItem disabled={row.publication_status !== "published"} onClick={() => open(row, "unpublish")}>{tr("Take offline", "Mettre hors ligne")}</DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setTimelineFor(row)}>{tr("Open timeline", "Ouvrir l'historique")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      <ReasonDialog
        open={Boolean(pending)}
        kind={pending?.kind ?? "block"}
        schoolName={pending?.row.name ?? ""}
        initialSteps={pending?.kind === "resolution" ? pending.row.case?.resolution_steps ?? "" : ""}
        pending={act.isPending}
        serverErrors={errors}
        onCancel={() => { setPending(null); setErrors({}); }}
        onSubmit={(reason, steps) => pending && act.mutate({ row: pending.row, kind: pending.kind, reason, steps })}
      />

      <Sheet open={Boolean(timelineFor)} onOpenChange={(next) => !next && setTimelineFor(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{timelineFor?.name}</SheetTitle>
            <SheetDescription>{tr("Everything staff did on this website, with the reasons given.", "Tout ce que l'equipe a fait sur ce site, avec les motifs donnes.")}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {timeline.isError ? (
              <LoadError message={tr("Could not load the timeline.", "Impossible de charger l'historique.")} onRetry={() => timeline.refetch()} retrying={timeline.isFetching} />
            ) : timeline.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr("Loading...", "Chargement...")}</p>
            ) : (
              <OversightTimelineList events={timeline.data?.timeline ?? []} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
