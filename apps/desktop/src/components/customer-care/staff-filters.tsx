"use client";

import { RotateCcw } from "lucide-react";
import type { CareExecutive, CareGroup, ConversationFilters } from "@/lib/api/services/customer-care.service";
import { CHANNEL_LABELS, GROUP_FALLBACK, STATUS_LABELS, STATUS_ORDER, pick } from "@/lib/customer-care-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type StaffFilters = {
  status: string;
  group: string;
  assignee: string;
  channel: string;
  date_from: string;
  date_to: string;
  overdue: boolean;
  unread: boolean;
};

export const EMPTY_FILTERS: StaffFilters = {
  status: "all",
  group: "all",
  assignee: "all",
  channel: "all",
  date_from: "",
  date_to: "",
  overdue: false,
  unread: false,
};

export function toApiFilters(f: StaffFilters, q: string): ConversationFilters {
  return {
    q: q.trim() || undefined,
    status: f.status === "all" ? undefined : f.status,
    group: f.group === "all" ? undefined : f.group,
    assignee: f.assignee === "all" ? undefined : f.assignee,
    channel: f.channel === "all" ? undefined : f.channel,
    date_from: f.date_from || undefined,
    date_to: f.date_to || undefined,
    overdue: f.overdue ? 1 : undefined,
    unread: f.unread ? 1 : undefined,
  };
}

export function activeFilterCount(f: StaffFilters): number {
  return (
    [f.status, f.group, f.assignee, f.channel].filter((v) => v !== "all").length +
    [f.date_from, f.date_to].filter(Boolean).length +
    Number(f.overdue) +
    Number(f.unread)
  );
}

/** Left-hand filters / customer categories. Used inline on desktop and inside a sheet on mobile. */
export function StaffFiltersPanel({
  filters,
  onChange,
  groups,
  executives,
  language,
}: {
  filters: StaffFilters;
  onChange: (next: StaffFilters) => void;
  groups: CareGroup[];
  executives: CareExecutive[] | null;
  language: string;
}) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const set = (patch: Partial<StaffFilters>) => onChange({ ...filters, ...patch });
  const groupRows = ["A", "B", "C"].map((slug) => {
    const g = groups.find((x) => x.slug === slug);
    return { slug, name: g?.name || pick(language, GROUP_FALLBACK[slug] as any) };
  });
  const extra = groups.filter((g) => !["A", "B", "C"].includes(g.slug));

  return (
    <div className="space-y-5" data-testid="care-filters">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("Customer groups", "Groupes de clients")}</p>
        <div className="space-y-1">
          {[{ slug: "all", name: t("All customers", "Tous les clients") }, ...groupRows, ...extra.map((g) => ({ slug: g.slug, name: g.name }))].map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => set({ group: g.slug })}
              aria-pressed={filters.group === g.slug}
              className={cn(
                "flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-sm transition-colors",
                filters.group === g.slug ? "bg-[#264D73] font-semibold text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("Status", "Statut")}</Label>
          <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All statuses", "Tous les statuts")}</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{pick(language, STATUS_LABELS[s] as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("Assigned executive", "Exécutif assigné")}</Label>
          <Select value={filters.assignee} onValueChange={(v) => set({ assignee: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Anyone", "Tous")}</SelectItem>
              <SelectItem value="me">{t("Assigned to me", "Assignées à moi")}</SelectItem>
              <SelectItem value="unassigned">{t("Unassigned", "Non assignées")}</SelectItem>
              {(executives || []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("Channel", "Canal")}</Label>
          <Select value={filters.channel} onValueChange={(v) => set({ channel: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All channels", "Tous les canaux")}</SelectItem>
              {Object.keys(CHANNEL_LABELS).map((c) => (
                <SelectItem key={c} value={c}>{pick(language, CHANNEL_LABELS[c] as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="care-date-from" className="text-xs">{t("From", "Du")}</Label>
            <Input id="care-date-from" type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={(e) => set({ date_from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="care-date-to" className="text-xs">{t("To", "Au")}</Label>
            <Input id="care-date-to" type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => set({ date_to: e.target.value })} />
          </div>
        </div>

        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={filters.unread} onChange={(e) => set({ unread: e.target.checked })} />
          {t("Unread only", "Non lues seulement")}
        </label>
        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={filters.overdue} onChange={(e) => set({ overdue: e.target.checked })} />
          {t("Overdue follow-ups only", "Suivis en retard seulement")}
        </label>
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => onChange(EMPTY_FILTERS)} disabled={!activeFilterCount(filters)}>
        <RotateCcw className="h-3.5 w-3.5" /> {t("Reset filters", "Réinitialiser")}
      </Button>
    </div>
  );
}
