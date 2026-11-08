"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Filters of the executive Schools tab. They live in the URL query string
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

type Group = { key: keyof SchoolFilters; label: string; options: { value: string; label: string }[] };

const GROUPS: Group[] = [
  {
    key: "education_category",
    label: "Category",
    options: [
      { value: "basic", label: "Nursery & Primary" },
      { value: "secondary", label: "Secondary" },
      { value: "higher", label: "Higher" },
    ],
  },
  {
    key: "level",
    label: "Level",
    options: [
      { value: "nursery", label: "Nursery" },
      { value: "primary", label: "Primary" },
      { value: "secondary", label: "Secondary" },
      { value: "higher", label: "Higher" },
    ],
  },
  {
    key: "school_type",
    label: "Type",
    options: [
      { value: "general", label: "General" },
      { value: "technical", label: "Technical" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    key: "subsystem",
    label: "Subsystem",
    options: [
      { value: "anglophone", label: "Anglophone" },
      { value: "francophone", label: "Francophone" },
      { value: "bilingual", label: "Bilingual" },
    ],
  },
  {
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "pending", label: "Pending activation" },
      { value: "suspended", label: "Suspended" },
    ],
  },
];

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
  onChange,
  onClear,
}: {
  filters: SchoolFilters;
  facets?: SchoolFacets;
  onChange: (patch: Partial<SchoolFilters>) => void;
  onClear: () => void;
}) {
  const anyActive = KEYS.some((key) => filters[key]);
  return (
    <div className="space-y-3 rounded-2xl border bg-white p-3 shadow-sm sm:p-4" aria-label="School filters">
      {GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="w-24 shrink-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {group.label}
          </span>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {group.options.map((option) => {
              const selected = filters[group.key] === option.value;
              const count = facets?.[group.key]?.[option.value];
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  className="h-9 shrink-0 rounded-full px-3 text-[11px] font-bold"
                  onClick={() => onChange({ [group.key]: selected ? "" : option.value })}
                >
                  {option.label}
                  {typeof count === "number" && (
                    <span className={`ml-2 rounded-full px-1.5 text-[10px] ${selected ? "bg-white/25" : "bg-accent"}`}>
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
      {anyActive && (
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>{typeof facets?.total === "number" ? `${facets.total} matching schools` : "Filters applied"}</span>
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={onClear}>
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
