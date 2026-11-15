"use client";

import type { OutreachLevel, OutreachStatus } from "@/lib/api/services/outreach.service";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const LEVELS: Array<{ value: OutreachLevel; en: string; fr: string }> = [
  { value: "nursery", en: "Nursery", fr: "Maternelle" },
  { value: "primary", en: "Primary", fr: "Primaire" },
  { value: "secondary", en: "Secondary", fr: "Secondaire" },
  { value: "technical", en: "Technical", fr: "Technique" },
  { value: "higher", en: "Higher", fr: "Superieur" },
  { value: "other", en: "Other", fr: "Autre" },
];

export const REGION_FR: Record<string, string> = {
  adamawa: "Adamaoua",
  centre: "Centre",
  east: "Est",
  far_north: "Extreme-Nord",
  littoral: "Littoral",
  north: "Nord",
  north_west: "Nord-Ouest",
  south: "Sud",
  south_west: "Sud-Ouest",
  west: "Ouest",
  unknown: "Region non precisee",
};

export const REGION_VALUES = [
  "adamawa", "centre", "east", "far_north", "littoral", "north", "north_west", "south", "south_west", "west", "unknown",
] as const;

type Tr = (en: string, fr: string) => string;

export function levelLabel(level: string, tr: Tr) {
  const found = LEVELS.find((l) => l.value === level);
  return found ? tr(found.en, found.fr) : level;
}

const STATUS_STYLE: Record<OutreachStatus, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  queued: "bg-amber-50 text-amber-800 border-amber-200",
  sent: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  bounced: "bg-red-50 text-red-700 border-red-200",
  unsubscribed: "bg-orange-50 text-orange-800 border-orange-200",
};

export function StatusBadge({ status, tr }: { status: OutreachStatus; tr: Tr }) {
  const label: Record<OutreachStatus, string> = {
    new: tr("Not contacted", "Non contacte"),
    queued: tr("Waiting to send", "En attente d'envoi"),
    sent: tr("Contacted", "Contacte"),
    failed: tr("Failed", "Echec"),
    bounced: tr("Bounced", "Adresse invalide"),
    unsubscribed: tr("Opted out", "Desinscrit"),
  };
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", STATUS_STYLE[status])}>
      {label[status] ?? status}
    </Badge>
  );
}

export function LevelBadge({ level, tr }: { level: string; tr: Tr }) {
  return (
    <Badge variant="secondary" className="rounded-full font-medium">
      {levelLabel(level, tr)}
    </Badge>
  );
}

export function formatDate(value: string | null | undefined, language: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}
