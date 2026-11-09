"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { extractFieldErrors, publicSiteService } from "@/lib/api/services/public-site.service";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, CheckCircle2, Circle, Copy, ExternalLink, Globe, Loader2, Lock, Share2 } from "lucide-react";
import { SetupProgress } from "./setup-progress";
import { Section, StatusChip, formatDateTime, publicSiteUrl, useTr, type TabProps } from "./shared";

/** Where each missing item is fixed. `goTo` switches tab; `href` leaves the page. */
const FIX_TARGETS: Record<string, { tab?: string; href?: string; en: string; fr: string }> = {
  name: { href: "/dashboard/settings", en: "Open school settings", fr: "Ouvrir les parametres" },
  description: { tab: "identity", en: "Write the description", fr: "Rediger la description" },
  contact: { href: "/dashboard/settings", en: "Add email or phone", fr: "Ajouter email ou telephone" },
};

const REQUIRED_ITEMS: Array<{ key: string; en: string; fr: string }> = [
  { key: "name", en: "School name", fr: "Nom de l'ecole" },
  { key: "description", en: "Short description of the school", fr: "Courte description de l'ecole" },
  { key: "contact", en: "At least one contact method (email or phone)", fr: "Au moins un moyen de contact (email ou telephone)" },
];

export function OverviewTab({ profile, readOnly, goTo }: TabProps) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const blockers = profile.publish_blockers || {};
  const isPublished = profile.publication_status === "published";
  const url = publicSiteUrl(profile.school.slug);

  const refresh = (fresh: typeof profile) => {
    queryClient.setQueryData(PUBLIC_SITE_KEYS.profile, fresh);
    queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.mine });
    queryClient.invalidateQueries({ queryKey: ["public-site", "audit"] });
  };

  const publish = useMutation({
    mutationFn: publicSiteService.publish,
    onSuccess: (fresh) => {
      setServerErrors({});
      refresh(fresh);
      toast({ title: tr("Your website is live", "Votre site est en ligne"), description: tr("Anyone can now open it.", "Tout le monde peut maintenant l'ouvrir.") });
    },
    onError: (error) => {
      setServerErrors(extractFieldErrors(error));
      toast({
        variant: "destructive",
        title: tr("Cannot publish yet", "Publication impossible pour le moment"),
        description: getApiErrorMessage(error, tr("Some required information is missing.", "Des informations obligatoires manquent.")),
      });
    },
  });

  const unpublish = useMutation({
    mutationFn: publicSiteService.unpublish,
    onSuccess: (fresh) => {
      refresh(fresh);
      setConfirmUnpublish(false);
      toast({ title: tr("Website taken offline", "Site mis hors ligne") });
    },
    onError: (error) =>
      toast({ variant: "destructive", title: tr("Could not unpublish", "Depublication impossible"), description: getApiErrorMessage(error, "") }),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: tr("Link copied", "Lien copie") });
    } catch {
      toast({ variant: "destructive", title: tr("Copy failed", "Copie impossible"), description: url });
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: profile.school.name, url });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    await copy();
  };

  const extra = Object.entries(blockers).filter(([key]) => !REQUIRED_ITEMS.some((i) => i.key === key));
  const missingCount = Object.keys(blockers).length;
  const shownErrors = { ...blockers, ...serverErrors };

  return (
    <div className="space-y-6">
      <Section
        title={tr("Website status", "Etat du site")}
        description={tr("Your public school website at EduIgnite.", "Le site public de votre ecole sur EduIgnite.")}
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={profile.publication_status} live={profile.is_live} />
          {profile.published_at && isPublished ? (
            <span className="text-sm text-muted-foreground">
              {tr("Published on", "Publie le")} {formatDateTime(profile.published_at)}
            </span>
          ) : null}
        </div>

        {profile.locked_by_founder ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>
              {tr(
                "EduIgnite switched your public website off. You cannot publish it until the platform unlocks it. Please contact EduIgnite support.",
                "EduIgnite a desactive votre site public. Vous ne pouvez pas le publier tant que la plateforme ne l'a pas debloque. Veuillez contacter le support EduIgnite.",
              )}
            </p>
          </div>
        ) : null}

        {isPublished && !profile.is_live ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {tr(
                "Your site is marked as published, but it is not visible: the school account or public pages are currently disabled by the platform.",
                "Votre site est marque comme publie mais il n'est pas visible : le compte de l'ecole ou les pages publiques sont actuellement desactives par la plateforme.",
              )}
            </p>
          </div>
        ) : null}

        {profile.is_live && url ? (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-primary" /> {tr("Your website address", "L'adresse de votre site")}
            </p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm font-semibold text-primary underline-offset-2 hover:underline">
              {url}
            </a>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("Open website", "Ouvrir le site")}</a>
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={copy}><Copy className="h-4 w-4" />{tr("Copy link", "Copier le lien")}</Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={share}><Share2 className="h-4 w-4" />{tr("Share", "Partager")}</Button>
            </div>
          </div>
        ) : null}

        {!readOnly ? (
          isPublished ? (
            <Button
              size="lg"
              variant="outline"
              className="h-14 w-full text-base font-bold sm:w-auto sm:px-10"
              onClick={() => setConfirmUnpublish(true)}
              disabled={unpublish.isPending}
            >
              {unpublish.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {tr("Unpublish website", "Depublier le site")}
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-14 w-full bg-emerald-600 text-base font-bold hover:bg-emerald-700 sm:w-auto sm:px-10"
              onClick={() => publish.mutate()}
              disabled={publish.isPending || profile.locked_by_founder}
            >
              {publish.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {tr("Publish website", "Publier le site")}
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            {tr("Only the school administrator can publish or unpublish the website.", "Seul l'administrateur de l'ecole peut publier ou depublier le site.")}
          </p>
        )}
      </Section>

      <SetupProgress profile={profile} goTo={goTo} />

      {!isPublished ? (
        <Section
          title={tr("Before you publish", "Avant de publier")}
          description={
            missingCount
              ? tr(`${missingCount} item(s) still missing.`, `${missingCount} element(s) manquant(s).`)
              : tr("Everything required is in place. You can publish.", "Tout est en place. Vous pouvez publier.")
          }
        >
          <ul className="space-y-3">
            {REQUIRED_ITEMS.map((item) => {
              const missing = shownErrors[item.key];
              const target = FIX_TARGETS[item.key];
              return (
                <li key={item.key} className="flex flex-wrap items-start gap-3">
                  {missing ? <Circle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tr(item.en, item.fr)}</p>
                    {missing ? <p className="text-xs text-destructive">{missing}</p> : null}
                  </div>
                  {missing && target ? (
                    target.tab ? (
                      <Button size="sm" variant="secondary" onClick={() => goTo(target.tab!)}>{tr(target.en, target.fr)}</Button>
                    ) : (
                      <Button size="sm" variant="secondary" asChild><Link href={target.href!}>{tr(target.en, target.fr)}</Link></Button>
                    )
                  ) : null}
                </li>
              );
            })}
            {extra.map(([key, message]) => (
              <li key={key} className="flex items-start gap-3">
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{message}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Take your website offline?", "Mettre le site hors ligne ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "Visitors will no longer be able to open your school website. You can publish it again at any time.",
                "Les visiteurs ne pourront plus ouvrir le site de votre ecole. Vous pourrez le publier a nouveau a tout moment.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => unpublish.mutate()}>{tr("Unpublish", "Depublier")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
