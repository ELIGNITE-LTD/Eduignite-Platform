"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n-context";

/**
 * Filters of the executive Schools tab, shown as five dropdowns (default: All). They live in the URL query string
 * (?education_category=basic&status=pending) so a filtered view can be shared;
 * the server does the filtering (see backend apps/schools/filters.py).
 */
export type SchoolFilters = {
  education_category: string;
  level: string;
  school_type: string;
  subsystem: string;
  status: string;
};

export const EMPTY_SCHOOL_FILTERS: SchoolFilters = {
  education_category: "",
  level: "",
  school_type: "",
  subsystem: "",
  status: "",
};

const KEYS = Object.keys(EMPTY_SCHOOL_FILTERS) as (keyof SchoolFilters)[];

export type SchoolFacets = {
  total?: number;
  education_category?: Record<string, number>;
  level?: Record<string, number>;
  school_type?: Record<string, number>;
  subsystem?: Record<string, number>;
  status?: Record<string, number>;
};

type L = { en: string; fr: string };
type Group = { key: keyof SchoolFilters; label: L; options: { value: string; label: L }[] };

const GROUPS: Group[] = [
  {
    key: "education_category",
    label: { en: "Category", fr: "Catégorie" },
    options: [
      { value: "basic", label: { en: "Nursery & Primary", fr: "Maternelle & Primaire" } },
      { value: "secondary", label: { en: "Secondary", fr: "Secondaire" } },
      { value: "higher", label: { en: "Higher", fr: "Supérieur" } },
    ],
  },
  {
    key: "level",
    label: { en: "Level", fr: "Niveau" },
    options: [
      { value: "nursery", label: { en: "Nursery", fr: "Maternelle" } },
      { value: "primary", label: { en: "Primary", fr: "Primaire" } },
      { value: "secondary", label: { en: "Secondary", fr: "Secondaire" } },
      { value: "higher", label: { en: "Higher", fr: "Supérieur" } },
    ],
  },
  {
    key: "school_type",
    label: { en: "Type", fr: "Type" },
    options: [
      { value: "general", label: { en: "General", fr: "Général" } },
      { value: "technical", label: { en: "Technical", fr: "Technique" } },
      { value: "mixed", label: { en: "Mixed", fr: "Mixte" } },
    ],
  },
  {
    key: "subsystem",
    label: { en: "Subsystem", fr: "Sous-système" },
    options: [
      { value: "anglophone", label: { en: "Anglophone", fr: "Anglophone" } },
      { value: "francophone", label: { en: "Francophone", fr: "Francophone" } },
      { value: "bilingual", label: { en: "Bilingual", fr: "Bilingue" } },
    ],
  },
  {
    key: "status",
    label: { en: "Status", fr: "Statut" },
    options: [
      { value: "active", label: { en: "Active", fr: "Actif" } },
      { value: "pending", label: { en: "Pending activation", fr: "En attente d'activation" } },
      { value: "suspended", label: { en: "Suspended", fr: "Suspendu" } },
    ],
  },
];

const ALL = "__all__";

function readFromUrl(): SchoolFilters {
  const next = { ...EMPTY_SCHOOL_FILTERS };
  if (typeof window === "undefined") return next;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of KEYS) next[key] = params.get(key) || "";
  } catch {
    /* ignore a malformed query string */
  }
  return next;
}

/** Filters state kept in sync with the address bar (no router needed, so it also works in the static mobile build). */
export function useSchoolFilters() {
  const [filters, setFilters] = useState<SchoolFilters>(EMPTY_SCHOOL_FILTERS);

  useEffect(() => {
    setFilters(readFromUrl());
    const onPop = () => setFilters(readFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<SchoolFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      try {
        const params = new URLSearchParams(window.location.search);
        for (const key of KEYS) {
          if (next[key]) params.set(key, next[key]);
          else params.delete(key);
        }
        const query = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      } catch {
        /* the URL is a convenience; filtering still works without it */
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => update({ ...EMPTY_SCHOOL_FILTERS }), [update]);
  const active = KEYS.filter((key) => filters[key]).length;
  return { filters, update, clear, active };
}

export function SchoolFilterBar({
  filters,
  facets,
  matching,
  searching = false,
  onChange,
  onClear,
}: {
  filters: SchoolFilters;
  facets?: SchoolFacets;
  /** Number of schools the current list matches (from the paginated response). */
  matching?: number;
  /** True when the search box has text, so the summary and clear button show. */
  searching?: boolean;
  onChange: (patch: Partial<SchoolFilters>) => void;
  onClear: () => void;
}) {
  const { language } = useI18n();
  const fr = language !== "en";
  const tr = (l: L) => (fr ? l.fr : l.en);
  const anyActive = KEYS.some((key) => filters[key]) || searching;
  const summary =
    typeof matching === "number"
      ? fr
        ? `${matching} école${matching > 1 ? "s" : ""} correspondante${matching > 1 ? "s" : ""}`
        : `${matching} matching school${matching === 1 ? "" : "s"}`
      : fr
        ? "Filtres appliqués"
        : "Filters applied";
  return (
    <div className="space-y-3 rounded-2xl border bg-white p-3 shadow-sm sm:p-4" role="group" aria-label={fr ? "Filtres des écoles" : "School filters"}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {GROUPS.map((group) => {
          const counts = facets?.[group.key];
          const selected = filters[group.key];
          const label = tr(group.label);
          const allCount = counts && group.key !== "level" ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
          return (
            <div key={group.key} className="min-w-0 space-y-1">
              <span id={`school-filter-${group.key}`} className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
              <Select
                value={selected || ALL}
                onValueChange={(value) => onChange({ [group.key]: value === ALL ? "" : value })}
              >
                <SelectTrigger
                  aria-labelledby={`school-filter-${group.key}`}
                  className={`h-10 rounded-xl text-xs font-bold ${selected ? "border-primary bg-primary/5" : ""}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    {fr ? "Tous" : "All"}
                    {typeof allCount === "number" ? ` (${allCount})` : ""}
                  </SelectItem>
                  {group.options.map((option) => {
                    const count = counts?.[option.value];
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        {tr(option.label)}
                        {typeof count === "number" ? ` (${count})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      {anyActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span aria-live="polite">{summary}</span>
          <Button type="button" size="sm" variant="ghost" className="h-9 gap-1 text-xs" onClick={onClear}>
            <X className="h-3.5 w-3.5" /> {fr ? "Effacer les filtres" : "Clear filters"}
          </Button>
        </div>
      )}
    </div>
  );
}
