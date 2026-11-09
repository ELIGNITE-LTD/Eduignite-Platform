"use client";

import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n-context";
import { publicSiteService } from "@/lib/api/services/public-site.service";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { Section, formatDateTime, useTr } from "./shared";
import { OversightTimelineList } from "./oversight-timeline";
import { CheckCircle2, ShieldAlert } from "lucide-react";

const SUCCESS_WINDOW_DAYS = 14;

/**
 * School-admin side: why the website is blocked, what to do, who and when,
 * the messages so far, and (after an unblock) a success notice. The server
 * refuses publishing and editing while blocked; this only explains it.
 */
export function BlockBanner() {
  const tr = useTr();
  const { language } = useI18n();
  const query = useQuery({
    queryKey: PUBLIC_SITE_KEYS.oversightMine,
    queryFn: publicSiteService.oversightMine,
    refetchInterval: 60_000,
  });
  const data = query.data;
  if (!data) return null;

  if (data.blocked && data.case) {
    const c = data.case;
    return (
      <div className="space-y-4" role="alert">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-2 text-sm">
              <p className="text-base font-bold text-destructive">{tr("Your website is blocked", "Votre site est bloque")}</p>
              <p className="text-muted-foreground">
                {tr(
                  "Your website is offline. You cannot publish or edit it until EduIgnite staff unblock it. When it is unblocked it returns to the state it had before.",
                  "Votre site est hors ligne. Vous ne pouvez ni le publier ni le modifier tant que l'equipe EduIgnite ne l'a pas debloque. Au deblocage, il retrouve son etat precedent.",
                )}
              </p>
              <p className="whitespace-pre-wrap break-words"><span className="font-semibold">{tr("Reason: ", "Motif : ")}</span>{c.block_reason}</p>
              {c.resolution_steps ? (
                <p className="whitespace-pre-wrap break-words"><span className="font-semibold">{tr("What you must do: ", "Ce que vous devez faire : ")}</span>{c.resolution_steps}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {tr("Blocked by", "Bloque par")} {c.blocked_by_name}{c.blocked_by_department ? ` (${c.blocked_by_department})` : ""} - {formatDateTime(c.blocked_at, language)}
              </p>
              <p className="text-xs text-muted-foreground">{tr("When done, contact Customer Care so the block can be reviewed.", "Une fois fait, contactez le service client pour que le blocage soit examine.")}</p>
            </div>
          </div>
        </div>
        <Section title={tr("Messages about this block", "Messages sur ce blocage")}>
          <OversightTimelineList events={data.timeline} />
        </Section>
      </div>
    );
  }

  const resolved = data.last_resolved;
  if (resolved?.unblocked_at) {
    const ageDays = (Date.now() - new Date(resolved.unblocked_at).getTime()) / 86_400_000;
    if (ageDays <= SUCCESS_WINDOW_DAYS) {
      const live = resolved.restored_status === "published";
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">{live ? tr("Your website is live again", "Votre site est de nouveau en ligne") : tr("The block on your website was lifted", "Le blocage de votre site a ete leve")}</p>
            <p className="whitespace-pre-wrap break-words">{resolved.unblock_reason}</p>
            <p className="text-xs">
              {tr("Unblocked by", "Debloque par")} {resolved.unblocked_by_name} - {formatDateTime(resolved.unblocked_at, language)}
            </p>
          </div>
        </div>
      );
    }
  }
  return null;
}
