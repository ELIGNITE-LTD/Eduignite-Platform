"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { publicSiteService } from "@/lib/api/services/public-site.service";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, ExternalLink, Loader2, Lock, RefreshCw } from "lucide-react";
import { Section, StatusChip, formatDateTime, previewUrl, useTr, type TabProps } from "./shared";

export function PublicationTab({ profile, readOnly }: TabProps) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const link = previewUrl(profile.school.slug, profile.preview_token);

  const rotate = useMutation({
    mutationFn: publicSiteService.rotatePreviewToken,
    onSuccess: ({ preview_token }) => {
      queryClient.setQueryData(PUBLIC_SITE_KEYS.profile, { ...profile, preview_token });
      queryClient.invalidateQueries({ queryKey: ["public-site", "audit"] });
      toast({ title: tr("New preview link created", "Nouveau lien d'apercu cree"), description: tr("The previous link no longer works.", "Le lien precedent ne fonctionne plus.") });
    },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not create the link", "Creation du lien impossible"), description: getApiErrorMessage(error, "") }),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: tr("Link copied", "Lien copie") });
    } catch {
      toast({ variant: "destructive", title: tr("Copy failed", "Copie impossible") });
    }
  };

  return (
    <div className="space-y-6">
      <Section
        title={tr("Preview before publishing", "Apercu avant publication")}
        description={tr(
          "A private link that shows your website even while it is not published. Share it only with people you trust: anyone who has it can see the preview. Create a new link at any time and the old one stops working.",
          "Un lien prive qui montre votre site meme s'il n'est pas publie. Ne le partagez qu'avec des personnes de confiance : toute personne qui l'a peut voir l'apercu. Creez un nouveau lien a tout moment et l'ancien cesse de fonctionner.",
        )}
      >
        {link ? (
          <div className="space-y-3">
            <p className="break-all rounded-xl border bg-muted/30 p-3 text-xs">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("Open preview", "Ouvrir l'apercu")}</a>
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={copy}><Copy className="h-4 w-4" />{tr("Copy link", "Copier le lien")}</Button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {profile.school.slug
              ? tr("No preview link yet.", "Pas encore de lien d'apercu.")
              : tr("Your school has no public address yet, so a preview is not available.", "Votre ecole n'a pas encore d'adresse publique, l'apercu n'est donc pas disponible.")}
          </p>
        )}
        {!readOnly ? (
          <Button variant="secondary" size="sm" className="gap-2" disabled={rotate.isPending || !profile.school.slug} onClick={() => rotate.mutate()}>
            {rotate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {link ? tr("Create a new link (old one stops working)", "Creer un nouveau lien (l'ancien cesse de fonctionner)") : tr("Create preview link", "Creer le lien d'apercu")}
          </Button>
        ) : null}
      </Section>

      <Section title={tr("Publication", "Publication")}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={profile.publication_status} live={profile.is_live} />
          {profile.published_at ? <span className="text-sm text-muted-foreground">{formatDateTime(profile.published_at)}</span> : null}
        </div>
        <div className={`flex gap-3 rounded-xl border p-4 text-sm ${profile.locked_by_founder ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}>
          <Lock className={`mt-0.5 h-4 w-4 shrink-0 ${profile.locked_by_founder ? "text-destructive" : "text-muted-foreground"}`} />
          <p>
            {profile.locked_by_founder
              ? tr(
                  "Publication is locked by EduIgnite. You cannot publish until the platform removes the lock. Contact EduIgnite support.",
                  "La publication est verrouillee par EduIgnite. Vous ne pouvez pas publier tant que la plateforme n'a pas leve le verrou. Contactez le support EduIgnite.",
                )
              : tr("Publication is not locked by the platform.", "La publication n'est pas verrouillee par la plateforme.")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {tr("Publish or unpublish from the Overview tab.", "Publiez ou depubliez depuis l'onglet Apercu general.")}
        </p>
      </Section>
    </div>
  );
}

const PAGE_SIZE = 20;

function actionLabel(action: string, tr: (en: string, fr: string) => string) {
  const map: Record<string, [string, string]> = {
    profile_updated: ["Settings edited", "Parametres modifies"],
    published: ["Published", "Publie"],
    unpublished: ["Unpublished", "Depublie"],
    preview_token_rotated: ["Preview link renewed", "Lien d'apercu renouvele"],
    force_unpublished: ["Taken offline by EduIgnite", "Mis hors ligne par EduIgnite"],
    publication_unlocked: ["Unlocked by EduIgnite", "Deverrouille par EduIgnite"],
  };
  const entry = map[action];
  return entry ? tr(entry[0], entry[1]) : action.replace(/_/g, " ");
}

export function AuditTab(_: TabProps) {
  const tr = useTr();
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: PUBLIC_SITE_KEYS.audit(page),
    queryFn: () => publicSiteService.getAudit(PAGE_SIZE, page * PAGE_SIZE),
    placeholderData: (previous) => previous,
  });
  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Section title={tr("Change history", "Historique des modifications")} description={tr("Who changed your public website, and when.", "Qui a modifie votre site public, et quand.")}>
      {query.isError ? (
        <LoadError message={tr("Could not load the history.", "Impossible de charger l'historique.")} onRetry={() => query.refetch()} retrying={query.isFetching} />
      ) : query.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr("Loading...", "Chargement...")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("No changes recorded yet.", "Aucune modification enregistree.")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("When", "Quand")}</TableHead>
                  <TableHead>{tr("Who", "Qui")}</TableHead>
                  <TableHead>{tr("What", "Quoi")}</TableHead>
                  <TableHead>{tr("Details", "Details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell className="text-sm">{row.actor_name || "-"}</TableCell>
                    <TableCell className="text-sm font-medium">{actionLabel(row.action, tr)}</TableCell>
                    <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                      {Object.keys(row.changes || {}).length
                        ? Object.keys(row.changes).map((field) => field.replace(/_/g, " ")).join(", ")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{tr(`Page ${page + 1} of ${pages}`, `Page ${page + 1} sur ${pages}`)} ({total})</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{tr("Previous", "Precedent")}</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{tr("Next", "Suivant")}</Button>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
