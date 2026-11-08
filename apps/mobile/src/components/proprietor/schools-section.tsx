"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTr } from "./common";

export type SchoolsSection = "schools" | "proprietors";

/** Which section of the founder's Schools tab is open. The choice lives in the address (?section=proprietors). */
export function useSchoolsSection(enabled: boolean) {
  const [section, setSection] = useState<SchoolsSection>("schools");
  useEffect(() => {
    if (!enabled) return;
    try {
      if (new URLSearchParams(window.location.search).get("section") === "proprietors") setSection("proprietors");
    } catch {
      /* the address is a convenience */
    }
  }, [enabled]);
  const change = (next: SchoolsSection) => {
    setSection(next);
    try {
      const params = new URLSearchParams(window.location.search);
      if (next === "proprietors") params.set("section", next);
      else params.delete("section");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    } catch {
      /* ignore */
    }
  };
  return { section: enabled ? section : ("schools" as SchoolsSection), change };
}

export function SchoolsSectionSwitch({ section, onChange }: { section: SchoolsSection; onChange: (next: SchoolsSection) => void }) {
  const tr = useTr();
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-accent/40 p-1 sm:w-auto sm:max-w-sm" role="tablist" aria-label={tr("Schools section", "Section des écoles")}>
      {(
        [
          ["schools", tr("Schools", "Écoles")],
          ["proprietors", tr("Proprietors", "Propriétaires")],
        ] as const
      ).map(([value, label]) => (
        <Button
          key={value}
          type="button"
          role="tab"
          aria-selected={section === value}
          variant={section === value ? "default" : "ghost"}
          className="h-10 rounded-xl text-xs font-black uppercase tracking-widest"
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
