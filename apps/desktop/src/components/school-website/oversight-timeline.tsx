"use client";

import { useI18n } from "@/lib/i18n-context";
import type { OversightAction, OversightEvent } from "@/lib/api/services/public-site.service";
import { formatDateTime, useTr } from "./shared";

export function useActionLabel() {
  const tr = useTr();
  return (action: OversightAction) =>
    ({
      block: tr("Blocked", "Bloque"),
      unblock: tr("Unblocked", "Debloque"),
      steps_updated: tr("Steps updated", "Etapes mises a jour"),
      publish: tr("Published by staff", "Publie par l'equipe"),
      unpublish: tr("Taken offline by staff", "Mis hors ligne par l'equipe"),
      edit: tr("Edited by staff", "Modifie par l'equipe"),
      delete_content: tr("Content removed by staff", "Contenu supprime par l'equipe"),
    })[action] ?? action;
}

/** Newest first: who did what, when, why, and the steps the school was asked to take. */
export function OversightTimelineList({ events }: { events: OversightEvent[] }) {
  const tr = useTr();
  const { language } = useI18n();
  const label = useActionLabel();
  if (events.length === 0) {
    return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{tr("No messages yet.", "Aucun message pour l'instant.")}</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-xl border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold">{label(event.action)}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at, language)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {event.actor_name}{event.actor_department ? ` - ${event.actor_department}` : ""}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words"><span className="font-medium">{tr("Reason: ", "Motif : ")}</span>{event.reason}</p>
          {event.resolution_steps ? (
            <p className="mt-1 whitespace-pre-wrap break-words"><span className="font-medium">{tr("What to do: ", "A faire : ")}</span>{event.resolution_steps}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
