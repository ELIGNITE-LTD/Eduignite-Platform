"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  extractFieldErrors,
  publicSiteService,
  type PublicSiteProfile,
} from "@/lib/api/services/public-site.service";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { SITE_URL } from "@/lib/public-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

/** English / French string picker for the current interface language. */
export function useTr() {
  const { language } = useI18n();
  return useCallback((en: string, fr: string) => (language === "fr" ? fr : en), [language]);
}

export function publicSiteUrl(slug: string | null | undefined) {
  return slug ? `${SITE_URL}/schools/${slug}` : "";
}

export function previewUrl(slug: string | null | undefined, token: string) {
  return slug && token ? `${SITE_URL}/schools/${slug}?preview=${encodeURIComponent(token)}` : "";
}

export interface TabProps {
  profile: PublicSiteProfile;
  /** True for sub-admins: they can look, the school administrator edits. */
  readOnly: boolean;
  goTo: (tab: string) => void;
}

/** A titled card used by every tab. */
export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border shadow-sm", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-headline text-primary">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** Label + control + inline error + optional character counter. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  count,
  max,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  count?: number;
  max?: number;
  children: ReactNode;
}) {
  const over = typeof count === "number" && typeof max === "number" && count > max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
        {typeof count === "number" && typeof max === "number" ? (
          <span className={cn("text-xs tabular-nums", over ? "text-destructive font-semibold" : "text-muted-foreground")}>
            {count}/{max}
          </span>
        ) : null}
      </div>
      {children}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Local edit state for a group of profile fields, saved with one PATCH that
 * carries only the fields this tab owns. Server validation errors come back
 * per field and are shown inline.
 */
export function useProfileForm<K extends keyof PublicSiteProfile>(profile: PublicSiteProfile, keys: readonly K[]) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tr = useTr();
  const pick = useCallback(
    () => Object.fromEntries(keys.map((k) => [k, profile[k]])) as Pick<PublicSiteProfile, K>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, ...keys],
  );
  const [values, setValues] = useState<Pick<PublicSiteProfile, K>>(pick);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-sync when the server copy changes (after a save or a refetch).
  useEffect(() => {
    setValues(pick());
  }, [pick]);

  const dirty = useMemo(
    () => keys.some((k) => JSON.stringify(values[k]) !== JSON.stringify(profile[k])),
    [keys, values, profile],
  );

  const mutation = useMutation({
    mutationFn: () => {
      const patch: Partial<PublicSiteProfile> = {};
      for (const k of keys) {
        if (JSON.stringify(values[k]) !== JSON.stringify(profile[k])) patch[k] = values[k];
      }
      return publicSiteService.updateProfile(patch);
    },
    onSuccess: (fresh) => {
      setErrors({});
      queryClient.setQueryData(PUBLIC_SITE_KEYS.profile, fresh);
      queryClient.invalidateQueries({ queryKey: ["public-site", "audit"] });
      toast({ title: tr("Saved", "Enregistre"), description: tr("Your website settings were updated.", "Les parametres de votre site ont ete mis a jour.") });
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast({
        variant: "destructive",
        title: tr("Could not save", "Enregistrement impossible"),
        description: getApiErrorMessage(error, tr("Please check the highlighted fields.", "Veuillez verifier les champs en rouge.")),
      });
    },
  });

  const set = <F extends K>(key: F, value: PublicSiteProfile[F]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const { [key as string]: _drop, ...rest } = prev;
      return rest;
    });
  };

  return { values, set, errors, dirty, saving: mutation.isPending, save: () => mutation.mutate() };
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  readOnly,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  readOnly: boolean;
}) {
  const tr = useTr();
  if (readOnly) {
    return (
      <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {tr(
          "You can view these settings. They cannot be changed by you right now (view-only role, or the website is blocked).",
          "Vous pouvez consulter ces parametres. Vous ne pouvez pas les modifier pour le moment (role en lecture seule ou site bloque).",
        )}
      </p>
    );
  }
  return (
    <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
      <span className="text-sm text-muted-foreground">
        {dirty ? tr("You have unsaved changes.", "Vous avez des modifications non enregistrees.") : tr("All changes saved.", "Toutes les modifications sont enregistrees.")}
      </span>
      <Button onClick={onSave} disabled={!dirty || saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {tr("Save changes", "Enregistrer")}
      </Button>
    </div>
  );
}

export function StatusChip({ status, live, blocked }: { status: PublicSiteProfile["publication_status"]; live?: boolean; blocked?: boolean }) {
  const tr = useTr();
  if (blocked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-800">
        <span className="h-2 w-2 rounded-full bg-red-600" />
        {tr("Blocked", "Bloque")}
      </span>
    );
  }
  const map = {
    published: { label: tr("Published", "Publie"), cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    unpublished: { label: tr("Unpublished", "Depublie"), cls: "bg-amber-100 text-amber-800 border-amber-200" },
    draft: { label: tr("Draft", "Brouillon"), cls: "bg-slate-100 text-slate-700 border-slate-200" },
  } as const;
  const item = map[status] ?? map.draft;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide", item.cls)}>
      <span className={cn("h-2 w-2 rounded-full", status === "published" && live !== false ? "bg-emerald-500" : "bg-current opacity-50")} />
      {item.label}
    </span>
  );
}

export function formatDateTime(value?: string | null, locale?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
