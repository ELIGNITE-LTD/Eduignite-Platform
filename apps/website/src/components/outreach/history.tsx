"use client";

import { useQuery } from "@tanstack/react-query";
import { outreachService } from "@/lib/api/services/outreach.service";
import { useI18n } from "@/lib/i18n-context";
import { useTr } from "@/components/school-website/shared";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "./shared";

export function OutreachHistory() {
  const tr = useTr();
  const { language } = useI18n();
  const q = useQuery({ queryKey: ["outreach", "campaigns"], queryFn: outreachService.campaigns });

  if (q.isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (q.isError) return <LoadError message={tr("Could not load the history.", "Impossible de charger l'historique.")} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("No message sent yet.", "Aucun message envoye pour le moment.")}</p>;
  }
  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">{c.subject}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(c.created_at, language)}
              {c.sent_by ? ` - ${tr("by", "par")} ${c.sent_by}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-sm text-muted-foreground">
            <span className="font-medium text-emerald-700">{c.sent} {tr("sent", "envoyes")}</span>
            {" / "}
            <span className="font-medium text-amber-700">{c.queued} {tr("waiting", "en attente")}</span>
            {" / "}
            <span className={c.failed ? "font-medium text-red-700" : ""}>{c.failed} {tr("failed", "echecs")}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
